// 길안내 링크: Google 지도 우선(범용 URL — 앱이 있으면 앱, 없으면 브라우저), Apple 지도는 언제나 바로 고를 수 있는 대체.
// iOS 홈 화면 앱(PWA)에서는 앱 설치 여부를 알 수 없다(canOpenURL 없음). 그래서 자동 추정 없이 두 버튼을 함께 둔다.
// 목적지 우선순위: 좌표 쌍 → 주소 → 장소명. 외부 지도 앱이 오프라인 경로를 계산한다고 약속하지 않는다.
// 문서: https://developers.google.com/maps/documentation/urls/get-started
//       https://developer.apple.com/documentation/mapkit/unified-map-urls (아래는 iOS 전 버전 호환인 daddr/dirflg 형식)

const validCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** 공항 3글자 코드만 있으면 "코드 airport"로 찾게 한다 */
const placeName = (s) => (/^[A-Z]{3}$/.test(s) ? `${s} airport` : s);

/** @returns {{ value: string, by: 'coords'|'address'|'name' } | null} */
export function destinationOf(place) {
  if (!place) return null;
  if (validCoord(place.lat, place.lng)) return { value: `${place.lat},${place.lng}`, by: 'coords' };
  if (place.address?.trim()) return { value: place.address.trim(), by: 'address' };
  const name = (place.query ?? place.name)?.trim();
  return name ? { value: placeName(name), by: 'name' } : null;
}

/**
 * 여행 수단·목적 → 경로 모드.
 * 도보(walk) → 걷기, 택시·차량 → 운전, 그 밖(관광지·역·공항으로 가기, 열차·버스 이동) → 대중교통.
 * 대중교통 모드는 가까우면 걷는 경로도 함께 보여 준다.
 */
export function travelMode(kind) {
  if (kind === 'walk') return 'walk';
  if (kind === 'taxi' || kind === 'car') return 'drive';
  return 'transit';
}

const GOOGLE_MODE = { walk: 'walking', transit: 'transit', drive: 'driving' };
const APPLE_FLAG = { walk: 'w', transit: 'r', drive: 'd' };

export function googleUrl(place, kind) {
  const d = destinationOf(place);
  if (!d) return null;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: d.value, travelmode: GOOGLE_MODE[travelMode(kind)] })}`;
}

export function appleUrl(place, kind) {
  const d = destinationOf(place);
  if (!d) return null;
  return `https://maps.apple.com/?${new URLSearchParams({ daddr: d.value, dirflg: APPLE_FLAG[travelMode(kind)] })}`;
}

/** 기존 이름 호환 */
export const directionsUrl = googleUrl;
