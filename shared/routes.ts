import { z } from 'zod';
import { insertUserSchema, insertFolderSchema, insertFileSchema, users, folders, files, auditLogs } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: z.object({
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users',
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
        403: errorSchemas.unauthorized,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/users',
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
      },
    },
  },
  fs: {
    list: {
      method: 'GET' as const,
      path: '/api/fs',
      input: z.object({
        folderId: z.string().optional(),
      }).optional(),
      responses: {
        200: z.object({
          folders: z.array(z.custom<typeof folders.$inferSelect>()),
          files: z.array(z.custom<typeof files.$inferSelect>()),
          breadcrumbs: z.array(z.object({ id: z.number(), name: z.string() })),
        }),
      },
    },
    recent: {
      method: 'GET' as const,
      path: '/api/fs/recent',
      responses: {
        200: z.array(z.custom<typeof files.$inferSelect>()),
      },
    },
    starred: {
      method: 'GET' as const,
      path: '/api/fs/starred',
      responses: {
        200: z.array(z.custom<typeof files.$inferSelect>()),
      },
    },
    trash: {
      method: 'GET' as const,
      path: '/api/fs/trash',
      responses: {
        200: z.object({
          files: z.array(z.custom<typeof files.$inferSelect>()),
          folders: z.array(z.custom<typeof folders.$inferSelect>()),
        }),
      },
    },
    createFolder: {
      method: 'POST' as const,
      path: '/api/fs/folder',
      input: insertFolderSchema,
      responses: {
        201: z.custom<typeof folders.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    toggleStar: {
      method: 'PATCH' as const,
      path: '/api/fs/:fileId/star',
      responses: {
        200: z.custom<typeof files.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/fs/:fileId',
      responses: {
        204: z.void(),
      },
    },
    storageUsage: {
      method: 'GET' as const,
      path: '/api/storage-usage',
      responses: {
        200: z.object({
          used: z.number(),
          total: z.number(),
          percentage: z.number(),
        }),
      },
    },
  },
  audit: {
    list: {
      method: 'GET' as const,
      path: '/api/audit-logs',
      responses: {
        200: z.array(z.custom<typeof auditLogs.$inferSelect>()),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
