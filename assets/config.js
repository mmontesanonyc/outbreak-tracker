const CONFIG = {
  map: {
    // match the keys to the values in the CSV file; match the values to the centroids of the areas you're showing dta for
    coords: {
      "10009": [40.7264, -73.9818], // East Village
      "10010": [40.7388, -73.9826], // Gramercy / Kips Bay
      "10003": [40.7318, -73.9887]  // Union Square / East Village
    },
    // set the initial view of the map: lat, long, and zoom level
    initialView: {
      lat: 40.7325,
      lng: -73.985,
      zoom: 14
    },
    height: 400,
    strokeColor: "black"
  },
  chart: {
    title: "New cases per day (NYC)",
    height: 160,
    primaryColor: "#4C78A8",
    highlightColor: "#0f3250",
    ruleColor: "black"
  },
  // This will set the playback speed, in milliseconds
  playback: {
    intervalMs: 200
  },
  // set timezone, for translation of dates in the CSV file to local time
  timeZone: "America/New_York",
  // choose data file
  data: {
    casesCsv: "assets/data.csv"
  }
};