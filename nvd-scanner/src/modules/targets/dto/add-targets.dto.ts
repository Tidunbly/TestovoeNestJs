import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AddTargetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  resources: string[];
}
