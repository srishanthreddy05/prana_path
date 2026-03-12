// Location service for geolocation operations

export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation not supported"));
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
};

export const reverseGeocode = (position) => {
  return new Promise((resolve) => {
    if (!window.google) {
      resolve(`${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`);
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: position }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        resolve(results[0].formatted_address);
      } else {
        resolve(`${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`);
      }
    });
  });
};

export const geocodeAddress = (address) => {
  return new Promise((resolve) => {
    if (!window.google) {
      resolve(null);
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        resolve(results[0]);
      } else {
        resolve(null);
      }
    });
  });
};

export const calculateETA = (driverLocation, pickupLocation) => {
  return new Promise((resolve) => {
    if (!window.google || !window.google.maps) {
      resolve(null);
      return;
    }

    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
      origins: [driverLocation],
      destinations: [pickupLocation],
      travelMode: window.google.maps.TravelMode.DRIVING,
      unitSystem: window.google.maps.UnitSystem.METRIC,
    }, (response, status) => {
      if (status === 'OK' && response.rows[0].elements[0].status === 'OK') {
        const duration = response.rows[0].elements[0].duration.value / 60; // Convert to minutes
        resolve(Math.ceil(duration));
      } else {
        resolve(null);
      }
    });
  });
};
