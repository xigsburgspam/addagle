export async function getDistrict(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          const data = await res.json();
          const district = data.address.state_district || data.address.county || data.address.city || data.address.state || 'Unknown';
          resolve(district);
        } catch (err) {
          console.error('Reverse geocoding failed:', err);
          reject(new Error('Failed to identify district from coordinates.'));
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        let message = 'Location access denied.';
        if (err.code === err.TIMEOUT) message = 'Location request timed out.';
        if (err.code === err.POSITION_UNAVAILABLE) message = 'Location information is unavailable.';
        reject(new Error(message));
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  });
}
