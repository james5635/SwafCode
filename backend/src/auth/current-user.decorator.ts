import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from './jwt.strategy';
import { AuthenticatedRequest } from './auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user as TokenPayload;
  },
);
