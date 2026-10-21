import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyAccessToken, TokenPayload } from './jwt.strategy';

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: TokenPayload;
};

@Injectable()
export class AuthGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No access token provided');
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = payload;
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }
}

export type { TokenPayload };
