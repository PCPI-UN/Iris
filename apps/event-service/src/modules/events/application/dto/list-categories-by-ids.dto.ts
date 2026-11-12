import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';

export const MAX_CATEGORY_IDS = 500;

export class ListCategoriesByIdsDTO {
  // gRPC omits empty repeated fields, so the list may arrive undefined
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CATEGORY_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];
}
