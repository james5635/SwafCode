import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { TokenPayload } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }
    return this.authService.register(dto.email, dto.password);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Body() dto: RefreshDto, @CurrentUser() user: TokenPayload) {
    if (!dto.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }
    await this.authService.logout(dto.refreshToken, user.sub);
    return { ok: true };
  }

  @Post('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: TokenPayload) {
    return { id: user.sub, email: user.email };
  }
}
