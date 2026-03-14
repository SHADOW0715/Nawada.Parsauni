(function () {
  // Replace with your real GA4 Measurement ID before production use.
  var GA_MEASUREMENT_ID = "G-BCLMPK5JNB";

  if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID === "G-XXXXXXXXXX") {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    transport_type: "beacon",
  });
})();


