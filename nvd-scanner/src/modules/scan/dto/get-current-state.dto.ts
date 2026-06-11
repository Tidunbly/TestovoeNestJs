import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';


class PeriodDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class GetCurrentStateDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PeriodDto)
  period?: PeriodDto;
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
