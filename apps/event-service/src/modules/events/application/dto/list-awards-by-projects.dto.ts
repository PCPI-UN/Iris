import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';

export const MAX_PROJECT_IDS = 500;

export class ListAwardsByProjectsDTO {
  // gRPC omits empty repeated fields, so the list may arrive undefined
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROJECT_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  projectIds?: number[];
}
