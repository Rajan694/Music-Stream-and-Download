import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
