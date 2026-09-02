import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PlaylistsService } from './playlists.service.js';
import { PinPlaylistDto } from './dto/playlist.dto.js';

@Controller('me/playlists')
@UseGuards(JwtAuthGuard)
export class PlaylistsController {
  constructor(private playlistsService: PlaylistsService) {}

  @Get()
  list(@CurrentUser() user: Express.User) {
    return this.playlistsService.list(user.id);
  }

  @Post()
  pin(@CurrentUser() user: Express.User, @Body() body: PinPlaylistDto) {
    return this.playlistsService.pin(user.id, body);
  }

  @Delete(':id')
  unpin(@CurrentUser() user: Express.User, @Param('id') playlistId: string) {
    return this.playlistsService.unpin(user.id, playlistId);
  }
}
