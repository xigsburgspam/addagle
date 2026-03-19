/**
 * Resolves the user's district using:
 * 1. Browser Geolocation API (works well on mobile)
 * 2. IP-based geolocation fallback (works on PC/laptop/desktop where
 *    geolocation is commonly blocked or unavailable)
 */

async function getDistrictFromIP(): Promise<string> {
  // ip-api.com free tier – no API key required
  const res = await fetch('http://ip-api.com/json/?fields=status,regionName,city,district');
  const data = await res.json();
  if (data.status !== 'success') throw new Error('IP geolocation failed');
  return data.district || data.regionName || data.city || 'Unknown';
}

async function getDistrictFromCoords(lat: number, lon: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
  );
  const data = await res.json();
  return (
    data.address.state_district ||
    data.address.county ||
    data.address.city ||
    data.address.state ||
    'Unknown'
  );
}

export async function getDistrict(): Promise<string> {
  // --- Try browser Geolocation first (best accuracy) ---
  if (navigator.geolocation) {
    try {
      const district = await new Promise<string>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const d = await getDistrictFromCoords(
                pos.coords.latitude,
                pos.coords.longitude
              );
              resolve(d);
            } catch (err) {
              reject(err);
            }
          },
          (err) => {
            // Silently fall through to IP fallback
            reject(err);
          },
          { timeout: 8000, enableHighAccuracy: false }
        );
      });
      return district;
    } catch {
      // Geolocation denied / unavailable / timed-out → fall through
    }
  }

  // --- IP-based fallback (reliable on PC/laptop/desktop) ---
  try {
    return await getDistrictFromIP();
  } catch (err) {
    console.error('IP geolocation fallback failed:', err);
    throw new Error('Could not determine your district. Please check your internet connection.');
  }
}