import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SettingsService } from './settings.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UpdateSettingsDto } from './dto/settings.dto.js';

@Controller('me/settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: Express.User) {
    return this.settingsService.getSettings(user.id);
  }

  @Patch()
  updateSettings(
    @CurrentUser() user: Express.User,
    @Body() body: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(user.id, body);
  }
}
