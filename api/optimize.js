// /api/optimize
// TMAP API를 대신 호출하는 중계 서버 함수.
// 1) 주소 목록을 좌표로 변환 (Full Text Geocoding)
// 2) 좌표를 TMAP "경유지 순서 최적화 100" API에 전달해 실제 도로 기반 최적 순서 계산
//
// App Key는 Vercel 환경변수(TMAP_APP_KEY)에서 읽으며, 클라이언트에는 노출되지 않음.

export default async function handler(req, res) {
  // CORS (같은 배포 도메인에서만 호출하지만, 안전하게 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    return;
  }

  const appKey = process.env.TMAP_APP_KEY;
  if (!appKey) {
    res.status(500).json({ error: '서버에 TMAP_APP_KEY 환경변수가 설정되어 있지 않습니다.' });
    return;
  }

  try {
    const { action, payload } = req.body || {};

    if (action === 'jskey') {
      // 지도 표시용 카카오 JavaScript 키 제공
      const kakaoKey = process.env.KAKAO_JS_KEY;
      if (!kakaoKey) {
        res.status(500).json({ error: '서버에 KAKAO_JS_KEY 환경변수가 설정되어 있지 않습니다.' });
        return;
      }
      res.status(200).json({ kakaoJsKey: kakaoKey });
      return;
    }

    if (action === 'geocode') {
      const result = await geocodeAddress(appKey, payload.address);
      res.status(200).json(result);
      return;
    }

    if (action === 'searchPoi') {
      const result = await searchPoi(appKey, payload.keyword);
      res.status(200).json(result);
      return;
    }

    if (action === 'optimize') {
      const result = await optimizeRoute(appKey, payload);
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: '알 수 없는 action입니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}

// 주소 -> 좌표 (Full Text Geocoding)
async function geocodeAddress(appKey, address) {
  const url = new URL('https://apis.openapi.sk.com/tmap/geo/fullAddrGeo');
  url.searchParams.set('version', '1');
  url.searchParams.set('coordType', 'WGS84GEO');
  url.searchParams.set('addressFlag', 'F00'); // 지번/도로명 모두 허용
  url.searchParams.set('fullAddr', address);
  url.searchParams.set('count', '1');

  const resp = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      appKey
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`지오코딩 실패 (${resp.status}): ${text.slice(0, 200)}`);
  }

  const data = await resp.json();

  // 응답 구조가 버전에 따라 다를 수 있어 여러 경로를 시도
  let list =
    data?.coordinateInfo?.coordinate ??
    data?.coordinateInfo?.coordinateList ??
    data?.searchPoiInfo?.pois?.poi ??
    null;

  if (!list) return { found: false, address };
  if (!Array.isArray(list)) list = [list];
  if (list.length === 0) return { found: false, address };

  const first = list[0];

  // 가능한 좌표 필드명들을 순서대로 시도
  const lonRaw = first.newLon ?? first.lon ?? first.frontLon ?? first.noorLon ?? first.x;
  const latRaw = first.newLat ?? first.lat ?? first.frontLat ?? first.noorLat ?? first.y;

  const lon = parseFloat(lonRaw);
  const lat = parseFloat(latRaw);

  if (isNaN(lon) || isNaN(lat)) {
    return { found: false, address };
  }

  const roadAddressParts = [
    first.city_do, first.gu_gun, first.eup_myun, first.adminDong,
    first.roadName, first.buildNo1 && first.buildNo2
      ? `${first.buildNo1}-${first.buildNo2}`
      : (first.buildNo1 || first.bunji)
  ].filter(Boolean);

  return {
    found: true,
    address,
    lat,
    lng: lon,
    roadAddress: roadAddressParts.length ? roadAddressParts.join(' ') : address
  };
}

// 경유지 최적화 (최대 98개 경유지 + 출발/도착 = 100)
async function optimizeRoute(appKey, payload) {
  const { start, end, viaPoints } = payload;
  // viaPoints: [{ id, name, x, y }]

  const body = {
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    startName: start.name || '출발',
    startX: String(start.lng),
    startY: String(start.lat),
    startTime: formatStartTime(),
    endName: end.name || '도착',
    endX: String(end.lng),
    endY: String(end.lat),
    searchOption: '0',
    carType: '4',
    viaPoints: viaPoints.map((v, i) => ({
      viaPointId: String(i + 1),
      viaPointName: v.name || `배송지${i + 1}`,
      viaX: String(v.lng),
      viaY: String(v.lat),
      viaTime: 60
    }))
  };

  const endpoint = pickEndpoint(viaPoints.length);

  const resp = await fetch(`https://apis.openapi.sk.com/tmap/routes/${endpoint}?version=1`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      appKey
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`경로 최적화 실패 (${resp.status}): ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  return parseOptimizeResponse(data);
}

// TMAP startTime 형식: YYYYMMDDHHmm (현지 시각, 분 단위)
function formatStartTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function pickEndpoint(viaCount) {
  if (viaCount <= 8) return 'routeOptimization10';
  if (viaCount <= 18) return 'routeOptimization20';
  if (viaCount <= 28) return 'routeOptimization30';
  return 'routeOptimization100';
}

// TMAP 응답을 프런트에서 쓰기 좋은 형태로 변환
function parseOptimizeResponse(data) {
  const props = data?.properties || {};
  const features = data?.features || [];

  const stops = [];
  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue;
    const p = f.properties || {};
    stops.push({
      index: parseInt(p.index, 10),
      name: (p.viaPointName || '').replace(/^\[\d+\]\s*/, ''),
      pointType: p.pointType, // S(출발), B1..Bn(경유), E(도착)
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      distanceFromPrev: parseInt(p.distance || '0', 10), // meters
      arriveTime: p.arriveTime || null
    });
  }

  stops.sort((a, b) => a.index - b.index);

  return {
    totalDistanceMeters: parseInt(props.totalDistance || '0', 10),
    totalTimeSeconds: parseInt(props.totalTime || '0', 10),
    stops
  };
}

// 키워드 기반 장소(POI) 검색 - 지오코딩 실패 주소를 사용자가 직접 선택하도록 후보 제공
async function searchPoi(appKey, keyword) {
  const url = new URL('https://apis.openapi.sk.com/tmap/pois');
  url.searchParams.set('version', '1');
  url.searchParams.set('searchKeyword', keyword);
  url.searchParams.set('resCoordType', 'WGS84GEO');
  url.searchParams.set('reqCoordType', 'WGS84GEO');
  url.searchParams.set('count', '10');
  url.searchParams.set('page', '1');

  const resp = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      appKey
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`장소 검색 실패 (${resp.status}): ${text.slice(0, 200)}`);
  }

  const rawText = await resp.text();
  if (!rawText || !rawText.trim()) {
    return { results: [] };
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    return { results: [] };
  }

  const pois = data?.searchPoiInfo?.pois?.poi || [];
  const list = Array.isArray(pois) ? pois : [pois];

  return {
    results: list.map((p) => {
      // 도로명 주소: 시/도 + 구/군 + 도로명 + 도로명주소 건물번호 (firstBuildNo/secondBuildNo)
      // 주의: firstNo/secondNo는 "지번" 번호이며 도로명 건물번호와 다름. 혼용하면 잘못된 주소가 됨.
      let roadAddress = '';
      if (p.roadName && p.firstBuildNo) {
        const buildingNo = p.secondBuildNo && p.secondBuildNo !== '0'
          ? `${p.firstBuildNo}-${p.secondBuildNo}`
          : p.firstBuildNo;
        roadAddress = [p.upperAddrName, p.middleAddrName, p.roadName, buildingNo]
          .filter(Boolean)
          .join(' ');
      }

      // 지번 주소: 시/도 + 구/군 + 동/읍/면 + 지번(firstNo-secondNo)
      let jibunAddress = '';
      const jibunHead = [p.upperAddrName, p.middleAddrName, p.lowerAddrName].filter(Boolean).join(' ');
      if (p.firstNo) {
        const jibunNo = p.secondNo && p.secondNo !== '0' ? `${p.firstNo}-${p.secondNo}` : p.firstNo;
        jibunAddress = [jibunHead, jibunNo].filter(Boolean).join(' ');
      } else {
        jibunAddress = jibunHead;
      }

      const displayAddress = roadAddress || jibunAddress;

      return {
        name: p.name || displayAddress,
        // 검색 결과 카드에는 도로명 주소만 표시 (없으면 지번 주소로 대체)
        address: displayAddress,
        jibunAddress,
        roadAddress,
        lat: parseFloat(p.noorLat || p.frontLat || p.lat),
        lng: parseFloat(p.noorLon || p.frontLon || p.lon),
        _raw: {
          name: p.name,
          upperAddrName: p.upperAddrName,
          middleAddrName: p.middleAddrName,
          lowerAddrName: p.lowerAddrName,
          roadName: p.roadName,
          firstNo: p.firstNo,
          secondNo: p.secondNo,
          firstBuildNo: p.firstBuildNo,
          secondBuildNo: p.secondBuildNo
        }
      };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng))
  };
}
