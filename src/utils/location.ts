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
          reject(err);
        }
      },
      (err) => {
        reject(err);
      },
      { timeout: 10000 }
    );
  });
}
