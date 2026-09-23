import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { ConversationalService } from './conversational.service';
import { IndexingService } from './indexing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(
    private searchService: SearchService,
    private conversationalService: ConversationalService,
    private indexingService: IndexingService,
  ) {}

  @Post('hybrid')
  async hybridSearch(
    @Body() body: { query: string; limit?: number; providers?: string[] },
    @CurrentUser() user: any,
  ) {
    return this.searchService.hybridSearch(body.query, user.id, body.limit, body.providers);
  }

  // Re-embeds all of the current user's notes, e.g. after switching embedding models
  @Post('reindex')
  async reindex(@CurrentUser() user: any) {
    return this.indexingService.bulkIndexNotes(user.id);
  }

  @Post('conversational')
  async conversationalSearch(
    @Body() body: { query: string; conversationId?: string },
    @CurrentUser() user: any,
  ) {
    return this.conversationalService.handleQuery(
      body.query,
      user.id,
      body.conversationId,
    );
  }

  @Get('suggestions')
  async getSuggestions(@Query('q') query: string, @CurrentUser() user: any) {
    // Simple implementation for now
    return { suggestions: [] };
  }
}

