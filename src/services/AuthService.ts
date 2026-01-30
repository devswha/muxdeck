import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export interface AuthConfig {
  secret: string;
  tokenExpiry: number;
  username: string;
  passwordHash: string;
}

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
}

const DEFAULT_CONFIG: AuthConfig = {
  secret: process.env.AUTH_SECRET || 'change-this-secret-in-production',
  tokenExpiry: parseInt(process.env.AUTH_TOKEN_EXPIRY || '86400', 10),
  username: process.env.AUTH_USERNAME || 'admin',
  passwordHash: process.env.AUTH_PASSWORD_HASH || '', // Empty means auth disabled
};

export class AuthService {
  private config: AuthConfig;

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  isEnabled(): boolean {
    return this.config.passwordHash !== '';
  }

  async validateCredentials(username: string, password: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return true; // Auth disabled
    }

    if (username !== this.config.username) {
      return false;
    }

    return bcrypt.compare(password, this.config.passwordHash);
  }

  generateToken(username: string): LoginResponse {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.config.tokenExpiry;

    const payload: JWTPayload = {
      sub: username,
      iat: now,
      exp,
    };

    const token = jwt.sign(payload, this.config.secret);
    const expiresAt = new Date(exp * 1000).toISOString();

    return { token, expiresAt };
  }

  verifyToken(token: string): JWTPayload {
    return jwt.verify(token, this.config.secret) as JWTPayload;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}

export const authService = new AuthService();
