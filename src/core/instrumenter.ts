import * as Babel from '@babel/standalone';

export interface TraceFrame {
  frameIndex: number;
  line: number;
  event: string;
  variables: Record<string, any>;
  callStack: string[];
  stdout: string[];
}

export function instrumentCode(sourceCode: string): string {
  const tracePlugin = ({ types: t }: any) => {
    // 收集当前作用域内所有可见的用户变量名
    const getVisibleVarNames = (scope: any): string[] => {
      const names = new Set<string>();
      let curr = scope;
      while (curr) {
        Object.keys(curr.bindings || {}).forEach((name) => {
          if (!name.startsWith('__')) names.add(name);
        });
        curr = curr.parent;
      }
      return Array.from(names);
    };

    // let/const 的暂时性死区(TDZ)会让快照读取尚未声明的绑定直接抛 ReferenceError，
    // 因此每个变量都用 try/catch 闭包安全读取。
    const buildSafeRead = (name: string) =>
      t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([
            t.tryStatement(
              t.blockStatement([t.returnStatement(t.identifier(name))]),
              t.catchClause(
                t.identifier('__mtmTdz'),
                t.blockStatement([t.returnStatement(t.identifier('undefined'))])
              )
            ),
          ])
        ),
        []
      );

    const buildSnapshotNode = (line: number, event: string, scope: any) => {
      const varNames = getVisibleVarNames(scope);
      const props = varNames.map((name) =>
        t.objectProperty(t.identifier(name), buildSafeRead(name))
      );
      return t.expressionStatement(
        t.callExpression(t.identifier('__trace'), [
          t.numericLiteral(line || 1),
          t.stringLiteral(event),
          t.objectExpression(props),
        ])
      );
    };

    return {
      visitor: {
        // 为所有循环注入死循环步数熔断器与循环帧记录
        'ForStatement|WhileStatement|DoWhileStatement'(path: any) {
          const line = path.node.loc?.start?.line || 1;
          const guardNode = t.expressionStatement(
            t.callExpression(t.identifier('__guard'), [t.numericLiteral(line)])
          );
          const snapNode = buildSnapshotNode(line, '循环迭代 (Loop Step)', path.scope);
          if (t.isBlockStatement(path.node.body)) {
            path.node.body.body.unshift(guardNode, snapNode);
          } else {
            path.node.body = t.blockStatement([guardNode, snapNode, path.node.body]);
          }
        },
        // 在代码块中的每条关键语句后注入变量快照
        'BlockStatement|Program'(path: any) {
          if (path.parentPath && path.parentPath.isFunctionDeclaration()) {
            const fnName = path.parentPath.node.id?.name || 'anonymous';
            const line = path.node.loc?.start?.line || 1;
            path.node.body.unshift(
              t.expressionStatement(
                t.callExpression(t.identifier('__enterFn'), [
                  t.stringLiteral(fnName),
                  t.numericLiteral(line),
                ])
              )
            );
          }
          const newBody: any[] = [];
          for (const stmt of path.node.body) {
            newBody.push(stmt);
            if (t.isVariableDeclaration(stmt) || t.isExpressionStatement(stmt)) {
              // 避免对注入的内部函数重复插桩
              const isInternal =
                t.isExpressionStatement(stmt) &&
                t.isCallExpression(stmt.expression) &&
                t.isIdentifier(stmt.expression.callee) &&
                stmt.expression.callee.name.startsWith('__');
              if (!isInternal && stmt.loc?.start?.line) {
                newBody.push(
                  buildSnapshotNode(stmt.loc.start.line, '状态更新 (State Update)', path.scope)
                );
              }
            }
          }
          path.node.body = newBody;
        },
      },
    };
  };

  const transformed = Babel.transform(sourceCode, {
    plugins: [tracePlugin],
    retainLines: true,
    configFile: false,
    babelrc: false,
  });

  if (!transformed?.code) {
    throw new Error('Babel 未能输出插桩后的代码');
  }

  return `
    let __steps = 0;
    const __MAX_STEPS = 2000;
    const __frames = [];
    const __callStack = ['main()'];
    const __stdout = [];

    // 熔断/异常时沙箱需要回收已采集的前序帧，因此把帧数组同时挂到全局。
    globalThis.__mtmFrames = __frames;

    const __clone = (val, depth = 0) => {
      if (depth > 4 || val === null || val === undefined) return val;
      if (typeof val === 'function') return '[Function]';
      if (typeof val !== 'object') return val;
      if (Array.isArray(val)) return val.map(item => __clone(item, depth + 1));
      const res = {};
      for (const k of Object.keys(val)) {
        res[k] = __clone(val[k], depth + 1);
      }
      return res;
    };

    const console = {
      log: (...args) => {
        __stdout.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      }
    };

    function __guard(line) {
      __steps++;
      if (__steps > __MAX_STEPS) {
        throw new Error(\`🚨 触发安全熔断：第 \${line} 行附近疑似存在死循环，执行已超过 \${__MAX_STEPS} 步上限！\`);
      }
    }

    function __enterFn(name, line) {
      __guard(line);
      __callStack.push(name + '()');
      if (__callStack.length > 150) {
        throw new Error(\`🚨 触发栈溢出熔断：函数 \${name} 递归深度超过 150 层！\`);
      }
    }

    function __trace(line, event, vars) {
      __guard(line);
      const cleanVars = {};
      for (const [k, v] of Object.entries(vars)) {
        if (typeof v !== 'function' && v !== undefined) {
          cleanVars[k] = __clone(v);
        }
      }
      __frames.push({
        frameIndex: __frames.length,
        line,
        event,
        variables: cleanVars,
        callStack: [...__callStack],
        stdout: [...__stdout]
      });
    }

    ${transformed.code}
    return __frames;
  `;
}
