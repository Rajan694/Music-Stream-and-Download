import { Router } from 'express';
import { currentUser } from '../lib/current-user.js';
import { ErrorCode } from '@music/shared';
import { Container } from '../container.js';
import { HttpError } from '../lib/http-error.js';
import { validate } from '../middleware/validate.js';
import { LoginSchema, RegisterSchema } from '../schemas/auth.schema.js';

const REFRESH_COOKIE = 'refresh_token';

export function createAuthRouter(container: Container) {
  const { auth, env, requireAuth } = container;
  const router = Router();

  function cookieOptions() {
    return {
      httpOnly: true,
      secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      domain: env.COOKIE_DOMAIN || undefined,
      path: '/',
    };
  }

  router.post('/register', validate({ body: RegisterSchema }), async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const isNative = req.headers['x-client'] === 'native';
      const { user, accessToken, refreshToken } = await auth.register(email, password);
      
      if (isNative) {
        res.status(201).json({ user, accessToken, refreshToken });
      } else {
        res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });
        res.status(201).json({ user, accessToken });
      }
    } catch (e) { next(e); }
  });

  router.post('/login', validate({ body: LoginSchema }), async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const isNative = req.headers['x-client'] === 'native';
      const { user, accessToken, refreshToken } = await auth.login(email, password);
      
      if (isNative) {
        res.json({ user, accessToken, refreshToken });
      } else {
        res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });
        res.json({ user, accessToken });
      }
    } catch (e) { next(e); }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const isNative = req.headers['x-client'] === 'native';
      const presented = isNative 
        ? req.body?.refreshToken 
        : req.cookies?.[REFRESH_COOKIE];
      
      if (!presented) {
        throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'No refresh token');
      }

      const { accessToken, refreshToken } = await auth.refresh(presented);
      
      if (isNative) {
        res.json({ accessToken, refreshToken });
      } else {
        res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });
        res.json({ accessToken });
      }
    } catch (e) {
      if (req.headers['x-client'] !== 'native') {
        res.clearCookie(REFRESH_COOKIE, cookieOptions());
      }
      next(e);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const isNative = req.headers['x-client'] === 'native';
      const token = isNative ? req.body?.refreshToken : req.cookies?.[REFRESH_COOKIE];
      
      await auth.logout(token);
      
      if (isNative) {
        res.json({ success: true });
      } else {
        res.clearCookie(REFRESH_COOKIE, cookieOptions());
        res.json({ success: true });
      }
    } catch (e) { next(e); }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(currentUser(req));
  });

  return router;
}