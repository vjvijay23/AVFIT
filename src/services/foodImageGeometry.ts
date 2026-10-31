export interface FoodImageCrop {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export function getFoodImageTransform(sourceWidth: number, sourceHeight: number) {
  const width = Math.max(1, Math.floor(sourceWidth));
  const height = Math.max(1, Math.floor(sourceHeight));
  const ratioUnits = Math.min(Math.floor(width / 4), Math.floor(height / 3));
  const cropWidth = ratioUnits > 0 ? ratioUnits * 4 : width;
  const cropHeight = ratioUnits > 0 ? ratioUnits * 3 : Math.min(height, Math.max(1, Math.round(width * 3 / 4)));
  const crop: FoodImageCrop = {
    originX: Math.round((width - cropWidth) / 2),
    originY: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
  return { crop, resizeWidth: Math.min(1024, crop.width) };
}
