
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// STEP 1: CREATE MAP

mapboxgl.accessToken = 'pk.eyJ1IjoibmdoaS1uZ3V5ZW4yMyIsImEiOiJjbXdkZWdzamswMDV2MzBwbTR3emNtMmRnIn0.HE_Q9gFgJad5nO8x1kBpoQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Select SVG overlay
const svg = d3.select('#map').select('svg');

// Convert station coordinates to map positions
function getCoords(station) {
  const point = new mapboxgl.LngLat(
    +station.lon,
    +station.lat
  );

  const { x, y } = map.project(point);

  return { cx: x, cy: y };
}

// Format minutes as time
function formatTime(minutes) {
  const date = new Date(2000, 0, 1, 0, minutes);

  return date.toLocaleString('en-US', {
    timeStyle: 'short',
  });
}

// Minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// STEP 4: CALCULATE STATION TRAFFIC

function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    const id = station.short_name;

    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic =
      station.arrivals + station.departures;

    return station;
  });
}

// STEP 5: FILTER TRIPS BY TIME

function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) {
    return trips;
  }

  return trips.filter((trip) => {
    const startedMinutes =
      minutesSinceMidnight(trip.started_at);

    const endedMinutes =
      minutesSinceMidnight(trip.ended_at);

    return (
      Math.abs(startedMinutes - timeFilter) <= 60 ||
      Math.abs(endedMinutes - timeFilter) <= 60
    );
  });
}

// STEP 6: TRAFFIC FLOW COLOR SCALE

const stationFlow = d3
  .scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);

// WAIT FOR MAP TO LOAD

map.on('load', async () => {

  // STEP 2: BOSTON BIKE LANES

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4,
    },
  });

  // STEP 2: CAMBRIDGE BIKE LANES

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4,
    },
  });

  // STEP 3: LOAD STATION DATA

  const jsonData = await d3.json(
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
  );

  // STEP 4: LOAD TRIP DATA

  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    }
  );

  // Calculate traffic at each station
  const stations = computeStationTraffic(
    jsonData.data.stations,
    trips
  );

  // Scale circle sizes by total traffic
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // STEP 3: DRAW STATION CIRCLES

  const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .style('--departure-ratio', (d) =>
      stationFlow(
        d.totalTraffic === 0
          ? 0.5
          : d.departures / d.totalTraffic
      )
    );

  // STEP 4: ADD TOOLTIPS

  // STEP 4: ADD TOOLTIPS

const tooltip = d3
  .select('body')
  .append('div')
  .attr('class', 'tooltip')
  .style('opacity', 0);

circles
  .on('mouseenter', function (event, d) {
    tooltip
      .style('opacity', 1)
      .html(`
        <strong>${d.name}</strong><br>
        Total trips: ${d.totalTraffic}<br>
        Departures: ${d.departures}<br>
        Arrivals: ${d.arrivals}
      `);
  })
  .on('mousemove', function (event) {
    tooltip
      .style('left', `${event.pageX + 12}px`)
      .style('top', `${event.pageY + 12}px`);
  })
  .on('mouseleave', function () {
    tooltip.style('opacity', 0);
  });

  // Update circle positions when map moves
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  updatePositions();

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);

  // STEP 5: TIME SLIDER

  const timeSlider =
    document.getElementById('time-slider');

  const selectedTime =
    document.getElementById('selected-time');

  const anyTimeLabel =
    document.getElementById('any-time');

  // Update visualization when slider changes
  function updateScatterPlot(timeFilter) {
    const filteredTrips =
      filterTripsByTime(trips, timeFilter);

    const filteredStations =
      computeStationTraffic(stations, filteredTrips);

    if (timeFilter === -1) {
      radiusScale.range([0, 25]);
    } else {
      radiusScale.range([3, 50]);
    }

    circles
      .data(filteredStations, (d) => d.short_name)
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .style('--departure-ratio', (d) =>
        stationFlow(
          d.totalTraffic === 0
            ? 0.5
            : d.departures / d.totalTraffic
        )
      );

  }

  function updateTimeDisplay() {
    const timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }

    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);

  updateTimeDisplay();
});
