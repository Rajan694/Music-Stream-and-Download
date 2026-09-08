import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().max(128),
});