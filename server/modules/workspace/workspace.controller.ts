import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';

import { WorkspaceService } from './workspace.service';
import { ReadingService } from './reading.service';
import { XunjiService } from './xunji.service';

@NeedLogin()
@Controller('api')
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly reading: ReadingService,
    private readonly xunji: XunjiService,
  ) {}

  @Get('health')
  health(@Req() req: Request) {
    return { data: { application: 'barry-workspace', status: 'ok', database: 'serverless-postgresql', userId: req.userContext.userId, now: new Date().toISOString() } };
  }

  @Get('state')
  async state(@Req() req: Request) {
    return { data: await this.workspace.state(req.userContext.userId) };
  }

  @Get('dashboard')
  async dashboard(@Req() req: Request, @Query('date') date?: string) {
    const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate();
    return { data: await this.workspace.dashboard(req.userContext.userId, selected) };
  }

  @Get('search')
  async search(@Req() req: Request, @Query('q') query = '') {
    return { data: await this.workspace.search(req.userContext.userId, query) };
  }

  @Post('collections/:collection')
  async create(@Req() req: Request, @Param('collection') collection: string, @Body() input: Record<string, any>) {
    return { data: await this.workspace.create(req.userContext.userId, collection, input ?? {}) };
  }

  @Patch('collections/:collection/:id')
  async update(@Req() req: Request, @Param('collection') collection: string, @Param('id') id: string, @Body() input: Record<string, any>) {
    return { data: await this.workspace.update(req.userContext.userId, collection, id, input ?? {}) };
  }

  @Delete('collections/:collection/:id')
  async remove(@Req() req: Request, @Param('collection') collection: string, @Param('id') id: string) {
    return { data: await this.workspace.softDelete(req.userContext.userId, collection, id) };
  }

  @Post('collections/:collection/:id/restore')
  async restore(@Req() req: Request, @Param('collection') collection: string, @Param('id') id: string) {
    return { data: await this.workspace.restore(req.userContext.userId, collection, id) };
  }

  @Delete('collections/:collection/:id/permanent')
  @HttpCode(204)
  async permanentDelete(@Req() req: Request, @Param('collection') collection: string, @Param('id') id: string) {
    await this.workspace.permanentDelete(req.userContext.userId, collection, id);
  }

  @Post('plan-items/:id/complete')
  async completePlan(@Req() req: Request, @Param('id') id: string) {
    return { data: await this.workspace.completePlan(req.userContext.userId, id) };
  }

  @Post('plan-items/:id/postpone')
  async postponePlan(@Req() req: Request, @Param('id') id: string, @Body() input: { date?: string }) {
    return { data: await this.workspace.postponePlan(req.userContext.userId, id, input?.date ?? '') };
  }

  @Get('daily-reviews/:date')
  async getReview(@Req() req: Request, @Param('date') date: string) {
    return { data: await this.workspace.getReview(req.userContext.userId, date) };
  }

  @Put('daily-reviews/:date')
  async setReview(@Req() req: Request, @Param('date') date: string, @Body() input: { content?: string }) {
    return { data: await this.workspace.setReview(req.userContext.userId, date, String(input?.content ?? '')) };
  }

  @Post('quick-memos/:id/convert')
  async convertMemo(@Req() req: Request, @Param('id') id: string, @Body() input: { collection?: string; fields?: Record<string, any> }) {
    return { data: await this.workspace.convertMemo(req.userContext.userId, id, input?.collection ?? '', input?.fields ?? {}) };
  }

  @Get('settings')
  async settings(@Req() req: Request) {
    return { data: await this.workspace.getSettings(req.userContext.userId) };
  }

  @Put('settings')
  async saveSettings(@Req() req: Request, @Body() input: Record<string, any>) {
    return { data: await this.workspace.saveSettings(req.userContext.userId, input ?? {}) };
  }

  @Get('system/status')
  async systemStatus(@Req() req: Request) {
    const state = await this.workspace.state(req.userContext.userId);
    return {
      data: {
        database: { engine: 'Miaoda Serverless PostgreSQL', role: '唯一主库', protection: 'RLS + 平台访问范围' },
        recordCount: Object.values(state).filter(Array.isArray).reduce((total, rows) => total + rows.length, 0),
        syncMode: '自动同步 + 手动按钮',
        exportPolicy: '导出包永远不包含密钥',
        now: new Date().toISOString(),
      },
    };
  }

  @Get('reading/dashboard')
  async readingDashboard(@Req() req: Request) {
    return { data: await this.reading.dashboard(req.userContext.userId) };
  }

  @Get('reading/calendar')
  async readingCalendar(@Req() req: Request, @Query('month') month?: string) {
    return { data: await this.reading.calendar(req.userContext.userId, month ?? localDate().slice(0, 7)) };
  }

  @Post('reading/sync')
  async syncReading(@Req() req: Request) {
    return { data: await this.reading.sync(req.userContext.userId) };
  }

  @Patch('reading/preferences')
  async readingPreferences(@Req() req: Request, @Body() input: { goalMinutes?: number }) {
    return { data: await this.reading.setGoalMinutes(req.userContext.userId, Number(input?.goalMinutes)) };
  }

  @Get('xunji/status')
  async xunjiStatus(@Req() req: Request) {
    return { data: await this.xunji.status(req.userContext.userId) };
  }

  @Post('xunji/sync')
  async syncXunji(@Req() req: Request, @Body() input: { startDate?: string; endDate?: string }) {
    return { data: await this.xunji.sync(req.userContext.userId, input ?? {}) };
  }

  @Get('export/state')
  async exportState(@Req() req: Request) {
    return { data: await this.workspace.state(req.userContext.userId) };
  }
}

function localDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
