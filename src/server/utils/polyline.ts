// Decodes a Google Maps encoded polyline
export function decode(encodedPath: string): {lat: number, lng: number}[] {
  let len = encodedPath.length;
  let index = 0;
  let lat = 0;
  let lng = 0;
  let path: {lat: number, lng: number}[] = [];

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encodedPath.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encodedPath.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    path.push({lat: lat / 1e5, lng: lng / 1e5});
  }
  return path;
}
