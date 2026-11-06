export interface Preset {
  id: string;
  icon: 'rain' | 'search' | 'bomb';
  title: string;
  subtitle: string;
  code: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'rain-water',
    icon: 'rain',
    title: '双指针接雨水',
    subtitle: 'Trapping Rain Water · left / right 夹逼',
    code: `function trapWater(height) {
  let left = 0;
  let right = height.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let water = 0;

  while (left < right) {
    if (height[left] < height[right]) {
      if (height[left] >= leftMax) {
        leftMax = height[left];
      } else {
        water += leftMax - height[left];
      }
      left++;
    } else {
      if (height[right] >= rightMax) {
        rightMax = height[right];
      } else {
        water += rightMax - height[right];
      }
      right--;
    }
  }

  return water;
}

const height = [0, 1, 0, 2, 1, 0, 3, 1, 2, 1, 4, 0];
const water = trapWater(height);
console.log("双指针接雨水总量 =", water);
`,
  },
  {
    id: 'binary-search',
    icon: 'search',
    title: '二分查找区间收缩',
    subtitle: 'Binary Search · low / high / mid',
    code: `function binarySearch(nums, target) {
  let low = 0;
  let high = nums.length - 1;
  let rounds = 0;

  while (low <= high) {
    rounds++;
    let mid = Math.floor((low + high) / 2);
    if (nums[mid] === target) {
      console.log("命中！", "mid =", mid, "轮次 =", rounds);
      return mid;
    }
    if (nums[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return -1;
}

const nums = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27];
const target = 19;
const index = binarySearch(nums, target);
console.log("目标", target, "最终下标 =", index);
`,
  },
  {
    id: 'dead-loop',
    icon: 'bomb',
    title: '死循环熔断测试',
    subtitle: 'while (true) · 2000 步安全熔断器',
    code: `function runaway(i) {
  let total = 0;
  while (true) {
    total += i * 2;
    i++;
    if (i % 2 === 0) {
      total = total - 1;
    }
  }
  return total;
}

let counter = 0;
console.log("即将进入 while(true)，等待沙箱熔断...");
const value = runaway(counter);
console.log("永远不会打印", value);
`,
  },
];

export const DEFAULT_PRESET = PRESETS[0];
