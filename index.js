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

// Habitica API base configuration
const HABITICA_API_BASE = 'https://habitica.com/api/v3';

// Validate environment variables
const HABITICA_USER_ID = process.env.HABITICA_USER_ID;
const HABITICA_API_TOKEN = process.env.HABITICA_API_TOKEN;

// Detect language (default EN)
setLanguage(process.env.MCP_LANG || process.env.LANG || 'en');

if (!HABITICA_USER_ID || !HABITICA_API_TOKEN) {
  console.error(t('Error: Please set HABITICA_USER_ID and HABITICA_API_TOKEN environment variables'));
  process.exit(1);
}

// Create Habitica API client
const habiticaClient = axios.create({
  baseURL: HABITICA_API_BASE,
  headers: {
    'x-api-user': HABITICA_USER_ID,
    'x-api-key': HABITICA_API_TOKEN,
    'x-client': `${HABITICA_USER_ID}-MCP-Server`,
    'Content-Type': 'application/json',
  },
});

// Create MCP server
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

// Tool definitions
const tools = [
  {
    name: 'get_user_profile',
    description: t('Get user profile'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_tasks',
    description: t('Get tasks list'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['habits', 'dailys', 'todos', 'rewards'],
          description: t('Task type'),
        },
      },
    },
  },
  {
    name: 'create_task',
    description: t('Create new task. For daily tasks, use frequency/everyX/repeat/startDate to set custom schedules'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['habit', 'daily', 'todo', 'reward'],
          description: t('Task type'),
        },
        text: {
          type: 'string',
          description: t('Task title'),
        },
        notes: {
          type: 'string',
          description: t('Task notes'),
        },
        difficulty: {
          type: 'number',
          enum: [0.1, 1, 1.5, 2],
          description: t('Difficulty (0.1=easy, 1=medium, 1.5=hard, 2=very hard)'),
        },
        priority: {
          type: 'number',
          enum: [0.1, 1, 1.5, 2],
          description: t('Priority (0.1=low, 1=med, 1.5=high, 2=urgent)'),
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: t('Repeat frequency for daily tasks. "daily"=every X days, "weekly"=specific days of week, "monthly"=by day/week of month, "yearly"=annually'),
        },
        everyX: {
          type: 'integer',
          minimum: 1,
          description: t('Repeat interval. For frequency="daily": every X days. "weekly": every X weeks. "monthly": every X months. Default is 1'),
        },
        repeat: {
          type: 'object',
          properties: {
            m: { type: 'boolean', description: t('Monday') },
            t: { type: 'boolean', description: t('Tuesday') },
            w: { type: 'boolean', description: t('Wednesday') },
            th: { type: 'boolean', description: t('Thursday') },
            f: { type: 'boolean', description: t('Friday') },
            s: { type: 'boolean', description: t('Saturday') },
            su: { type: 'boolean', description: t('Sunday') },
          },
          description: t('Days of week when task is active (for frequency="weekly"). Example: {"m":true,"w":true,"f":true} for Mon/Wed/Fri'),
        },
        daysOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 31 },
          description: t('Days of month when task is due (for frequency="monthly"). Example: [1,15] for 1st and 15th'),
        },
        weeksOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 4 },
          description: t('Weeks of month (0=first, 1=second, 2=third, 3=fourth, 4=last) combined with repeat days. Example: [0] with repeat.m=true for 1st Monday'),
        },
        startDate: {
          type: 'string',
          description: t('Start date in ISO 8601 format (e.g., "2024-01-15"). Task becomes active on this date'),
        },
        checklist: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: t('Checklist item text'),
              },
              completed: {
                type: 'boolean',
                description: t('Completed status'),
                default: false,
              },
            },
            required: ['text'],
          },
          description: t('Checklist items'),
        },
      },
      required: ['type', 'text'],
    },
  },
  {
    name: 'score_task',
    description: t('Score task / habit'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: t('Direction (up=positive, down=negative, habits only)'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_task',
    description: t('Update task properties including schedule. For daily tasks, use frequency/everyX/repeat/startDate to modify repeat schedule'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
        text: {
          type: 'string',
          description: t('Task title'),
        },
        notes: {
          type: 'string',
          description: t('Task notes'),
        },
        completed: {
          type: 'boolean',
          description: t('Completed flag'),
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'yearly'],
          description: t('Repeat frequency for daily tasks. "daily"=every X days, "weekly"=specific days of week, "monthly"=by day/week of month, "yearly"=annually'),
        },
        everyX: {
          type: 'integer',
          minimum: 1,
          description: t('Repeat interval. For frequency="daily": every X days. "weekly": every X weeks. "monthly": every X months'),
        },
        repeat: {
          type: 'object',
          properties: {
            m: { type: 'boolean', description: t('Monday') },
            t: { type: 'boolean', description: t('Tuesday') },
            w: { type: 'boolean', description: t('Wednesday') },
            th: { type: 'boolean', description: t('Thursday') },
            f: { type: 'boolean', description: t('Friday') },
            s: { type: 'boolean', description: t('Saturday') },
            su: { type: 'boolean', description: t('Sunday') },
          },
          description: t('Days of week when task is active (for frequency="weekly"). Example: {"m":true,"w":true,"f":true} for Mon/Wed/Fri'),
        },
        daysOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 31 },
          description: t('Days of month when task is due (for frequency="monthly"). Example: [1,15] for 1st and 15th'),
        },
        weeksOfMonth: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 4 },
          description: t('Weeks of month (0=first, 1=second, 2=third, 3=fourth, 4=last) combined with repeat days. Example: [0] with repeat.m=true for 1st Monday'),
        },
        startDate: {
          type: 'string',
          description: t('Start date in ISO 8601 format (e.g., "2024-01-15"). Task becomes active on this date'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description: t('Delete task'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_stats',
    description: t('Get user stats'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'buy_reward',
    description: t('Buy reward'),
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: t('Reward key or ID'),
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'get_inventory',
    description: t('Get inventory'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cast_spell',
    description: t('Cast spell'),
    inputSchema: {
      type: 'object',
      properties: {
        spellId: {
          type: 'string',
          description: t('Spell ID'),
        },
        targetId: {
          type: 'string',
          description: t('Target ID (optional)'),
        },
      },
      required: ['spellId'],
    },
  },
  {
    name: 'get_tags',
    description: t('Get tags list'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_tag',
    description: t('Create tag'),
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: t('Tag name'),
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_pets',
    description: t('Get pets list'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'feed_pet',
    description: t('Feed pet'),
    inputSchema: {
      type: 'object',
      properties: {
        pet: {
          type: 'string',
          description: t('Pet key'),
        },
        food: {
          type: 'string',
          description: t('Food key'),
        },
      },
      required: ['pet', 'food'],
    },
  },
  {
    name: 'hatch_pet',
    description: t('Hatch pet'),
    inputSchema: {
      type: 'object',
      properties: {
        egg: {
          type: 'string',
          description: t('Egg key'),
        },
        hatchingPotion: {
          type: 'string',
          description: t('Hatching potion key'),
        },
      },
      required: ['egg', 'hatchingPotion'],
    },
  },
  {
    name: 'get_mounts',
    description: t('Get mounts list'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'equip_item',
    description: t('Equip item'),
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['mount', 'pet', 'costume', 'equipped'],
          description: t('Equipment type'),
        },
        key: {
          type: 'string',
          description: t('Item key'),
        },
      },
      required: ['type', 'key'],
    },
  },
  {
    name: 'get_notifications',
    description: t('Get notifications list'),
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_notification',
    description: t('Mark notification as read'),
    inputSchema: {
      type: 'object',
      properties: {
        notificationId: {
          type: 'string',
          description: t('Notification ID'),
        },
      },
      required: ['notificationId'],
    },
  },
  {
    name: 'get_shop',
    description: t('Get shop items'),
    inputSchema: {
      type: 'object',
      properties: {
        shopType: {
          type: 'string',
          enum: ['market', 'questShop', 'timeTravelersShop', 'seasonalShop'],
          description: t('Shop type'),
        },
      },
    },
  },
  {
    name: 'buy_item',
    description: t('Buy shop item'),
    inputSchema: {
      type: 'object',
      properties: {
        itemKey: {
          type: 'string',
          description: t('Item key'),
        },
        quantity: {
          type: 'number',
          description: t('Purchase quantity'),
          default: 1,
        },
      },
      required: ['itemKey'],
    },
  },
  {
    name: 'add_checklist_item',
    description: t('Add checklist item to task'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
        text: {
          type: 'string',
          description: t('Checklist item text'),
        },
      },
      required: ['taskId', 'text'],
    },
  },
  {
    name: 'update_checklist_item',
    description: t('Update checklist item'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID'),
        },
        text: {
          type: 'string',
          description: t('Checklist item text'),
        },
        completed: {
          type: 'boolean',
          description: t('Completed status'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'delete_checklist_item',
    description: t('Delete checklist item'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
  {
    name: 'get_task_checklist',
    description: t('Get task checklist items'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'score_checklist_item',
    description: t('Score checklist item (mark complete/incomplete)'),
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: t('Task ID'),
        },
        itemId: {
          type: 'string',
          description: t('Checklist item ID'),
        },
      },
      required: ['taskId', 'itemId'],
    },
  },
];

// Register tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools,
  };
});

// Register tool call handler
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
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    throw new McpError(ErrorCode.InternalError, `Habitica API error: ${errorMessage}`);
  }
});

// Tool implementation functions
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
        text: `Successfully created task: ${task.text} (ID: ${task.id})`,
      },
    ],
  };
}

async function scoreTask(taskId, direction = 'up') {
  const response = await habiticaClient.post(`/tasks/${taskId}/score/${direction}`);
  const result = response.data.data;

  let message = `Task completed! `;
  if (result.exp) message += `Gained ${result.exp} XP `;
  if (result.gp) message += `Gained ${result.gp} gold `;
  if (result.lvl) message += `Leveled up to ${result.lvl}! `;

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
        text: `Successfully updated task: ${task.text}`,
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
        text: `Successfully deleted task (ID: ${taskId})`,
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
        text: `Successfully bought reward! Remaining gold: ${result.gp}`,
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
        text: `Successfully cast spell: ${spellId}`,
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
        text: `Successfully created tag: ${tag.name} (ID: ${tag.id})`,
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

  let message = `Successfully fed pet ${pet}! `;
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
        text: `Successfully hatched pet! Got ${egg}-${hatchingPotion}`,
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
        text: `Successfully equipped ${type}: ${key}`,
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
        text: `Successfully marked notification as read (ID: ${notificationId})`,
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
        text: `Successfully bought ${itemKey} x${quantity}! Remaining gold: ${result.gp}`,
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
        text: t(`Task: ${task.text}\nChecklist items (${checklist.length}):`),
      },
      {
        type: 'text',
        text: checklist.length > 0
          ? checklist.map(item => `${item.completed ? '✓' : '○'} ${item.text} (ID: ${item.id})`).join('\n')
          : t('No checklist items found'),
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
        text: t(`Successfully added checklist item: ${item.text} (ID: ${item.id})`),
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
        text: t(`Successfully updated checklist item: ${item.text}`),
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
        text: t(`Successfully deleted checklist item (ID: ${itemId})`),
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
        text: t(`Successfully scored checklist item: ${item.text} (completed: ${item.completed})`),
      },
    ],
  };
}

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Habitica MCP server started');
}

runServer().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
