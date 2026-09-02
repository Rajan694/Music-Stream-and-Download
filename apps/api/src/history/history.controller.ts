import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HistoryService } from './history.service.js';
import { RecentSongDto, SyncHistoryDto } from './dto/history.dto.js';

@Controller('me/history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private historyService: HistoryService) {}

  @Get()
  list(@CurrentUser() user: Express.User) {
    return this.historyService.listRecent(user.id);
  }

  @Post()
  add(@CurrentUser() user: Express.User, @Body() body: RecentSongDto) {
    return this.historyService.addRecentSong(user.id, body);
  }

  @Post('sync')
  sync(@CurrentUser() user: Express.User, @Body() body: SyncHistoryDto) {
    return this.historyService.syncBatch(user.id, body.items);
  }
}
