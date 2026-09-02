/**
 * Shape attached to the request by `JwtAuthGuard` and by Passport, so
 * `req.user` is typed instead of being cast at each use site.
 */
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      createdAt?: Date;
    }
  }
}

export {};
