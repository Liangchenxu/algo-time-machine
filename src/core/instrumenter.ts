import * as Babel from '@babel/standalone';

export interface TraceFrame {
  frameIndex: number;
  line: number;
  event: string;
  variables: Record<string, any>;
  callStack: string[];
  stdout: string[];
  lineHits?: Record<number, number>;
}

export function instrumentCode(sourceCode: string): string {
  const tracePlugin = ({ types: t }: any) => {
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

    // let/const 的暂时性死区(TDZ)：scope.bindings 含同一块内「稍后才声明」的绑定，
    // 直接写 typeof x 会抛 ReferenceError，因此每个变量用 try/catch 闭包安全读取。
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
        // Program 一并插桩，使顶层语句（如函数调用返回值、console.log）也产生时间帧
        'BlockStatement|Program'(path: any) {
          // 避免对内部生成的 try-finally 块重复插桩
          if ((path.node as any).__instrumented) return;
          (path.node as any).__instrumented = true;

          const newBody: any[] = [];
          for (const stmt of path.node.body) {
            newBody.push(stmt);
            if (t.isVariableDeclaration(stmt) || t.isExpressionStatement(stmt)) {
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

          // 如果是函数声明体，注入 __enterFn 与 try...finally { __exitFn() } 确保递归栈帧准确弹出
          if (path.parentPath && path.parentPath.isFunctionDeclaration()) {
            const fnName = path.parentPath.node.id?.name || 'anonymous';
            const line = path.node.loc?.start?.line || 1;
            const enterStmt = t.expressionStatement(
              t.callExpression(t.identifier('__enterFn'), [
                t.stringLiteral(fnName),
                t.numericLiteral(line),
              ])
            );
            const enterSnap = buildSnapshotNode(line, `函数进入: ${fnName}()`, path.scope);
            const exitBlock = t.blockStatement([
              t.expressionStatement(t.callExpression(t.identifier('__exitFn'), [])),
            ]);
            (exitBlock as any).__instrumented = true;

            const tryBlock = t.blockStatement([enterSnap, ...path.node.body]);
            (tryBlock as any).__instrumented = true;

            const wrappedBody = t.blockStatement([
              enterStmt,
              t.tryStatement(tryBlock, null, exitBlock),
            ]);
            (wrappedBody as any).__instrumented = true;
            path.replaceWith(wrappedBody);
          }
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
    const __lineHits = {};

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
        throw new Error(\`[FUSE_STEP_LIMIT] 疑似死循环：第 \${line} 行附近执行已超过 \${__MAX_STEPS} 步上限，沙箱已保留熔断前全部时间帧。\`);
      }
    }

    function __enterFn(name, line) {
      __guard(line);
      __callStack.push(name + '()');
      if (__callStack.length > 150) {
        throw new Error(\`[FUSE_STACK_OVERFLOW] 函数 \${name} 递归深度超过 150 层，触发调用栈熔断。\`);
      }
    }

    function __exitFn() {
      if (__callStack.length > 1) {
        __callStack.pop();
      }
    }

    function __trace(line, event, vars) {
      __guard(line);
      __lineHits[line] = (__lineHits[line] || 0) + 1;
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
        stdout: [...__stdout],
        lineHits: { ...__lineHits }
      });
    }

    ${transformed.code}
    return __frames;
  `;
}
