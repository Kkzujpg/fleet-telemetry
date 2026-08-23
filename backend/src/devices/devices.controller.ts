import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DeviceDetail, DevicesService, HistoryBucket, ListDevicesResult } from './devices.service';
import { parseHistoryQuery, parseListDevicesQuery, parsePatchDeviceBody } from './devices.dto';

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<ListDevicesResult> {
    const query = parseListDevicesQuery({ status, q, cursor, limit });
    return this.devices.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<DeviceDetail> {
    return this.devices.detail(id);
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('bucket') bucket: string | undefined,
  ): Promise<HistoryBucket[]> {
    const query = parseHistoryQuery({ from, to, bucket });
    return this.devices.history(id, query);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: unknown): Promise<DeviceDetail> {
    const patch = parsePatchDeviceBody(body);
    return this.devices.update(id, patch);
  }
}
