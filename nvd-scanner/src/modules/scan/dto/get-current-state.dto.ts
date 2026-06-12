import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


class PeriodDto {
  @ApiPropertyOptional({
    description: 'Start of the date range (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the date range (ISO 8601)',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class GetCurrentStateDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PeriodDto)
  period?: PeriodDto;

  @ApiPropertyOptional({
    description: 'Start date (ISO 8601). Alternative to period.from',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End date (ISO 8601). Alternative to period.to',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific IP addresses (comma-separated)',
    example: ['192.168.1.1', '10.0.0.1'],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim());
    }

    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  ips?: string[];

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    example: 1,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
