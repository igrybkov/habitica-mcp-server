#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';
import { setLanguage, t } from './i18n.js';

// Habitica API 基础配置
const HABITICA_API_BASE = 'https://habitica.com/api/v3';

// 验证环境变量
const HABITICA_USER_ID = process.env.HABITICA_USER_ID;
const HABITICA_API_TOKEN = process.env.HABITICA_API_TOKEN;

// Detect language (default EN)
setLanguage(process.env.MCP_LANG || process.env.LANG || 'en');

if (!HABITICA_USER_ID || !HABITICA_API_TOKEN) {
  console.error(t('Error: Please set HABITICA_USER_ID and HABITICA_API_TOKEN environment variables', '错误: 请设置 HABITICA_USER_ID 和 HABITICA_API_TOKEN 环境变量'));
  process.exit(1);
}

// 创建 Habitica API 客户端
const habiticaClient = axios.create({
  baseURL: HABITICA_API_BASE,
  headers: {
    'x-api-user': HABITICA_USER_ID,
    'x-api-key': HABITICA_API_TOKEN,
    'x-client': `${HABITICA_USER_ID}-MCP-Server`,
    'Content-Type': 'application/json',
  },
});

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'habitica-mcp-server',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具定义
const tools = [
  {
    name: 'get_user_profile',
    description: t('Get user profile', '获取用户档案信息'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_tasks',
    description: t('Get tasks list', '获取任务列表'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['habits', 'dailys', 'todos', 'rewards'],
          description: t('Task type', '任务类型'),
        },
      },
    },
  },
  {
    name: 'create_task',
    description: t(
      'Create new task. For daily tasks, use frequency/everyX/repeat/startDate to set custom schedules',
      '创建新任务。对于日常任务，使用 frequency/everyX/repeat/startDate 设置自定义计划'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['habit', 'daily', 'todo', 'reward'],
          description: t('Task type', '任务类型'),
        },
        text: {
          type: 'string',
          description: t('Task title', '任务标题'),
        },
        notes: {
          type: 'string',
          description: t('Task notes', '任务备注'),
        },
        difficulty: {
          type: 'number',
          enum: [0.1, 1, 1.5, 2],
          description: t('Difficulty (0.1=easy, 1=medium, 1.5=hard, 2=very hard)', '难度 (0.1=简单, 1=中等, 1.5=困难, 2=极难)'),
        },
        priority: {
          type: 'number',
          enum: [0.1, 1, 1.5, 2],
          description: t('Priority (0.1=low, 1=med, 1.5=high, 2=urgent)', '优先级 (0.1=低, 1=中, 1.5=高, 2=极高)'),
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: t(
            'Repeat frequency for daily tasks. "daily"=every X days, "weekly"=specific days of week, "monthly"=by day/week of month, "yearly"=annually',
            '日常任务的重复频率。"daily"=每X天，"weekly"=每周特定日，"monthly"=每月特定日/周，"yearly"=每年'
          ),
        },
        everyX: {
          type: 'integer',
          minimum: 1,
          description: t(
            'Repeat interval. For frequency="daily": every X days. "weekly": every X weeks. "monthly": every X months. Default is 1',
            '重复间隔。frequency="daily"时：每X天。"weekly"：每X周。"monthly"：每X月。默认为1'
          ),
        },
        repeat: {
          type: 'object',
          properties: {
            m: { type: 'boolean', description: t('Monday', '周一') },
            t: { type: 'boolean', description: t('Tuesday', '周二') },
            w: { type: 'boolean', description: t('Wednesday', '周三') },
            th: { type: 'boolean', description: t('Thursday', '周四') },
            f: { type: 'boolean', description: t('Friday', '周五') },
            s: { type: 'boolean', description: t('Saturday', '周六') },
            su: { type: 'boolean', description: t('Sunday', '周日') },
          },
          description: t(
            'Days of week when task is active (for frequency="weekly"). Example: {"m":true,"w":true,"f":true} for Mon/Wed/Fri',
            '任务激活的星期几（用于 frequency="weekly"）。示例：{"m":true,"w":true,"f":true} 表示周一/三/五'
          ),
        },
        daysOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 31 },
          description: t(
            'Days of month when task is due (for frequency="monthly"). Example: [1,15] for 1st and 15th',
            '任务到期的月份日期（用于 frequency="monthly"）。示例：[1,15] 表示1号和15号'
          ),
        },
        weeksOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 4 },
          description: t(
            'Weeks of month (0=first, 1=second, 2=third, 3=fourth, 4=last) combined with repeat days. Example: [0] with repeat.m=true for 1st Monday',
            '月份的第几周（0=第一，1=第二，2=第三，3=第四，4=最后）配合 repeat。示例：[0] 配合 repeat.m=true 表示第1个周一'
          ),
        },
        startDate: {
          type: 'string',
          description: t(
            'Start date in ISO 8601 format (e.g., "2024-01-15"). Task becomes active on this date',
            '开始日期，ISO 8601 格式（如 "2024-01-15"）。任务在此日期激活'
          ),
        },
        checklist: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: t('Checklist item text', '清单项目文本'),
              },
              completed: {
                type: 'boolean',
                description: t('Completed status', '完成状态'),
                default: false,
              },
            },
            required: ['text'],
          },
          description: t('Checklist items', '清单项目'),
        },
      },
      required: ['type', 'text'],
    },
  },
  {
    name: 'score_task',
    description: t('Score task / habit', '完成任务或记录习惯'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: t('Direction (up=positive, down=negative, habits only)', '方向 (up=正向, down=负向，仅适用于习惯)'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_task',
    description: t(
      'Update task properties including schedule. For daily tasks, use frequency/everyX/repeat/startDate to modify repeat schedule',
      '更新任务属性包括计划。对于日常任务，使用 frequency/everyX/repeat/startDate 修改重复计划'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
        text: {
          type: 'string',
          description: t('Task title', '任务标题'),
        },
        notes: {
          type: 'string',
          description: t('Task notes', '任务备注'),
        },
        completed: {
          type: 'boolean',
          description: t('Completed flag', '是否完成'),
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: t(
            'Repeat frequency for daily tasks. "daily"=every X days, "weekly"=specific days of week, "monthly"=by day/week of month, "yearly"=annually',
            '日常任务的重复频率。"daily"=每X天，"weekly"=每周特定日，"monthly"=每月特定日/周，"yearly"=每年'
          ),
        },
        everyX: {
          type: 'integer',
          minimum: 1,
          description: t(
            'Repeat interval. For frequency="daily": every X days. "weekly": every X weeks. "monthly": every X months',
            '重复间隔。frequency="daily"时：每X天。"weekly"：每X周。"monthly"：每X月'
          ),
        },
        repeat: {
          type: 'object',
          properties: {
            m: { type: 'boolean', description: t('Monday', '周一') },
            t: { type: 'boolean', description: t('Tuesday', '周二') },
            w: { type: 'boolean', description: t('Wednesday', '周三') },
            th: { type: 'boolean', description: t('Thursday', '周四') },
            f: { type: 'boolean', description: t('Friday', '周五') },
            s: { type: 'boolean', description: t('Saturday', '周六') },
            su: { type: 'boolean', description: t('Sunday', '周日') },
          },
          description: t(
            'Days of week when task is active (for frequency="weekly"). Example: {"m":true,"w":true,"f":true} for Mon/Wed/Fri',
            '任务激活的星期几（用于 frequency="weekly"）。示例：{"m":true,"w":true,"f":true} 表示周一/三/五'
          ),
        },
        daysOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 31 },
          description: t(
            'Days of month when task is due (for frequency="monthly"). Example: [1,15] for 1st and 15th',
            '任务到期的月份日期（用于 frequency="monthly"）。示例：[1,15] 表示1号和15号'
          ),
        },
        weeksOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 4 },
          description: t(
            'Weeks of month (0=first, 1=second, 2=third, 3=fourth, 4=last) combined with repeat days. Example: [0] with repeat.m=true for 1st Monday',
            '月份的第几周（0=第一，1=第二，2=第三，3=第四，4=最后）配合 repeat。示例：[0] 配合 repeat.m=true 表示第1个周一'
          ),
        },
        startDate: {
          type: 'string',
          description: t(
            'Start date in ISO 8601 format (e.g., "2024-01-15"). Task becomes active on this date',
            '开始日期，ISO 8601 格式（如 "2024-01-15"）。任务在此日期激活'
          ),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description: t('Delete task', '删除任务'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_stats',
    description: t('Get user stats', '获取用户统计信息'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'buy_reward',
    description: t('Buy reward', '购买奖励'),
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: t('Reward key or ID', '奖励的key或ID'),
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'get_inventory',
    description: t('Get inventory', '获取物品清单'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cast_spell',
    description: t('Cast spell', '施放技能'),
    inputSchema: {
      type: 'object',
      properties: {
        spellId: {
          type: 'string',
          description: t('Spell ID', '技能ID'),
        },
        targetId: {
          type: 'string',
          description: t('Target ID (optional)', '目标ID (可选)'),
        },
      },
      required: ['spellId'],
    },
  },
  {
    name: 'get_tags',
    description: t('Get tags list', '获取标签列表'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_tag',
    description: t('Create tag', '创建新标签'),
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: t('Tag name', '标签名称'),
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_pets',
    description: '获取宠物列表',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'feed_pet',
    description: '喂养宠物',
    inputSchema: {
      type: 'object',
      properties: {
        pet: {
          type: 'string',
          description: '宠物key',
        },
        food: {
          type: 'string',
          description: '食物key',
        },
      },
      required: ['pet', 'food'],
    },
  },
  {
    name: 'hatch_pet',
    description: '孵化宠物',
    inputSchema: {
      type: 'object',
      properties: {
        egg: {
          type: 'string',
          description: '蛋的key',
        },
        hatchingPotion: {
          type: 'string',
          description: '孵化药水的key',
        },
      },
      required: ['egg', 'hatchingPotion'],
    },
  },
  {
    name: 'get_mounts',
    description: '获取坐骑列表',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'equip_item',
    description: '装备物品',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['mount', 'pet', 'costume', 'equipped'],
          description: '装备类型',
        },
        key: {
          type: 'string',
          description: '物品key',
        },
      },
      required: ['type', 'key'],
    },
  },
  {
    name: 'get_notifications',
    description: '获取通知列表',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_notification',
    description: '标记通知为已读',
    inputSchema: {
      type: 'object',
      properties: {
        notificationId: {
          type: 'string',
          description: '通知ID',
        },
      },
      required: ['notificationId'],
    },
  },
  {
    name: 'get_shop',
    description: '获取商店物品',
    inputSchema: {
      type: 'object',
      properties: {
        shopType: {
          type: 'string',
          enum: ['market', 'questShop', 'timeTravelersShop', 'seasonalShop'],
          description: '商店类型',
        },
      },
    },
  },
  {
    name: 'buy_item',
    description: '购买商店物品',
    inputSchema: {
      type: 'object',
      properties: {
        itemKey: {
          type: 'string',
          description: '物品key',
        },
        quantity: {
          type: 'number',
          description: '购买数量',
          default: 1,
        },
      },
      required: ['itemKey'],
    },
  },
  {
    name: 'add_checklist_item',
    description: t('Add checklist item to task', '向任务添加清单项目'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
        text: {
          type: 'string',
          description: t('Checklist item text', '清单项目文本'),
        },
      },
      required: ['taskId', 'text'],
    },
  },
  {
    name: 'update_checklist_item',
    description: t('Update checklist item', '更新清单项目'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID', '清单项目ID'),
        },
        text: {
          type: 'string',
          description: t('Checklist item text', '清单项目文本'),
        },
        completed: {
          type: 'boolean',
          description: t('Completed status', '完成状态'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'delete_checklist_item',
    description: t('Delete checklist item', '删除清单项目'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID', '清单项目ID'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'get_task_checklist',
    description: t('Get task checklist items', '获取任务清单项目'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'score_checklist_item',
    description: t('Score checklist item (mark complete/incomplete)', '为清单项目评分（标记完成/未完成）'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID', '任务ID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID', '清单项目ID'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
];

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools,
  };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_user_profile':
        return await getUserProfile();
      
      case 'get_tasks':
        return await getTasks(args.type);
      
      case 'create_task':
        return await createTask(args);
      
      case 'score_task':
        return await scoreTask(args.taskId, args.direction);
      
      case 'update_task':
        return await updateTask(args.taskId, args);
      
      case 'delete_task':
        return await deleteTask(args.taskId);
      
      case 'get_stats':
        return await getStats();
      
      case 'buy_reward':
        return await buyReward(args.key);
      
      case 'get_inventory':
        return await getInventory();
      
      case 'cast_spell':
        return await castSpell(args.spellId, args.targetId);
      
      case 'get_tags':
        return await getTags();
      
      case 'create_tag':
        return await createTag(args.name);
      
      case 'get_pets':
        return await getPets();
      
      case 'feed_pet':
        return await feedPet(args.pet, args.food);
      
      case 'hatch_pet':
        return await hatchPet(args.egg, args.hatchingPotion);
      
      case 'get_mounts':
        return await getMounts();
      
      case 'equip_item':
        return await equipItem(args.type, args.key);
      
      case 'get_notifications':
        return await getNotifications();
      
      case 'read_notification':
        return await readNotification(args.notificationId);
      
      case 'get_shop':
        return await getShop(args.shopType);
      
      case 'buy_item':
        return await buyItem(args.itemKey, args.quantity);
      
      case 'get_task_checklist':
        return await getTaskChecklist(args.taskId);
      
      case 'add_checklist_item':
        return await addChecklistItem(args.taskId, args.text);
      
      case 'update_checklist_item':
        return await updateChecklistItem(args.taskId, args.itemId, args);
      
      case 'delete_checklist_item':
        return await deleteChecklistItem(args.taskId, args.itemId);
      
      case 'score_checklist_item':
        return await scoreChecklistItem(args.taskId, args.itemId);
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    
    const errorMessage = error.response?.data?.message || error.message || '未知错误';
    throw new McpError(ErrorCode.InternalError, `Habitica API 错误: ${errorMessage}`);
  }
});

// 工具实现函数
async function getUserProfile() {
  const response = await habiticaClient.get('/user');
  const user = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
}

async function getTasks(type) {
  const endpoint = type ? `/tasks/user?type=${type}` : '/tasks/user';
  const response = await habiticaClient.get(endpoint);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function createTask(taskData) {
  const response = await habiticaClient.post('/tasks/user', taskData);
  const task = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: `成功创建任务: ${task.text} (ID: ${task.id})`,
      },
    ],
  };
}

async function scoreTask(taskId, direction = 'up') {
  const response = await habiticaClient.post(`/tasks/${taskId}/score/${direction}`);
  const result = response.data.data;
  
  let message = `任务完成! `;
  if (result.exp) message += `获得 ${result.exp} 经验值 `;
  if (result.gp) message += `获得 ${result.gp} 金币 `;
  if (result.lvl) message += `升级到 ${result.lvl} 级! `;
  
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

async function updateTask(taskId, updates) {
  const response = await habiticaClient.put(`/tasks/${taskId}`, updates);
  const task = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: `成功更新任务: ${task.text}`,
      },
    ],
  };
}

async function deleteTask(taskId) {
  await habiticaClient.delete(`/tasks/${taskId}`);
  
  return {
    content: [
      {
        type: 'text',
        text: `成功删除任务 (ID: ${taskId})`,
      },
    ],
  };
}

async function getStats() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.stats, null, 2),
      },
    ],
  };
}

async function buyReward(key) {
  const response = await habiticaClient.post(`/user/buy/${key}`);
  const result = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: `成功购买奖励! 剩余金币: ${result.gp}`,
      },
    ],
  };
}

async function getInventory() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.items, null, 2),
      },
    ],
  };
}

async function castSpell(spellId, targetId) {
  const endpoint = targetId ? `/user/class/cast/${spellId}?targetId=${targetId}` : `/user/class/cast/${spellId}`;
  const response = await habiticaClient.post(endpoint);
  
  return {
    content: [
      {
        type: 'text',
        text: `成功施放技能: ${spellId}`,
      },
    ],
  };
}

async function getTags() {
  const response = await habiticaClient.get('/tags');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function createTag(name) {
  const response = await habiticaClient.post('/tags', { name });
  const tag = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: `成功创建标签: ${tag.name} (ID: ${tag.id})`,
      },
    ],
  };
}

async function getPets() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.items.pets, null, 2),
      },
    ],
  };
}

async function feedPet(pet, food) {
  const response = await habiticaClient.post(`/user/feed/${pet}/${food}`);
  const result = response.data.data;
  
  let message = `成功喂养宠物 ${pet}! `;
  if (result.message) {
    message += result.message;
  }
  
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

async function hatchPet(egg, hatchingPotion) {
  const response = await habiticaClient.post(`/user/hatch/${egg}/${hatchingPotion}`);
  const result = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: `成功孵化宠物! 获得了 ${egg}-${hatchingPotion}`,
      },
    ],
  };
}

async function getMounts() {
  const response = await habiticaClient.get('/user');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data.data.items.mounts, null, 2),
      },
    ],
  };
}

async function equipItem(type, key) {
  const response = await habiticaClient.post(`/user/equip/${type}/${key}`);
  
  return {
    content: [
      {
        type: 'text',
        text: `成功装备 ${type}: ${key}`,
      },
    ],
  };
}

async function getNotifications() {
  const response = await habiticaClient.get('/notifications');
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function readNotification(notificationId) {
  await habiticaClient.post(`/notifications/${notificationId}/read`);
  
  return {
    content: [
      {
        type: 'text',
        text: `成功标记通知为已读 (ID: ${notificationId})`,
      },
    ],
  };
}

async function getShop(shopType = 'market') {
  const response = await habiticaClient.get(`/shops/${shopType}`);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

async function buyItem(itemKey, quantity = 1) {
  const response = await habiticaClient.post(`/user/buy/${itemKey}`, { quantity });
  const result = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: `成功购买 ${itemKey} x${quantity}! 剩余金币: ${result.gp}`,
      },
    ],
  };
}

async function getTaskChecklist(taskId) {
  const response = await habiticaClient.get(`/tasks/${taskId}`);
  const task = response.data.data;
  const checklist = task.checklist || [];
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Task: ${task.text}\nChecklist items (${checklist.length}):`, `任务: ${task.text}\n清单项目 (${checklist.length}):`),
      },
      {
        type: 'text',
        text: checklist.length > 0 
          ? checklist.map(item => `${item.completed ? '✓' : '○'} ${item.text} (ID: ${item.id})`).join('\n')
          : t('No checklist items found', '未找到清单项目'),
      },
    ],
  };
}

async function addChecklistItem(taskId, text) {
  const response = await habiticaClient.post(`/tasks/${taskId}/checklist`, { text });
  const item = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Successfully added checklist item: ${item.text} (ID: ${item.id})`, `成功添加清单项目: ${item.text} (ID: ${item.id})`),
      },
    ],
  };
}

async function updateChecklistItem(taskId, itemId, updates) {
  const response = await habiticaClient.put(`/tasks/${taskId}/checklist/${itemId}`, updates);
  const item = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Successfully updated checklist item: ${item.text}`, `成功更新清单项目: ${item.text}`),
      },
    ],
  };
}

async function deleteChecklistItem(taskId, itemId) {
  await habiticaClient.delete(`/tasks/${taskId}/checklist/${itemId}`);
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Successfully deleted checklist item (ID: ${itemId})`, `成功删除清单项目 (ID: ${itemId})`),
      },
    ],
  };
}

async function scoreChecklistItem(taskId, itemId) {
  const response = await habiticaClient.post(`/tasks/${taskId}/checklist/${itemId}/score`);
  const item = response.data.data;
  
  return {
    content: [
      {
        type: 'text',
        text: t(`Successfully scored checklist item: ${item.text} (completed: ${item.completed})`, `成功评分清单项目: ${item.text} (完成状态: ${item.completed})`),
      },
    ],
  };
}

// 启动服务器
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Habitica MCP 服务器已启动');
}

runServer().catch((error) => {
  console.error('服务器启动失败:', error);
  process.exit(1);
}); 