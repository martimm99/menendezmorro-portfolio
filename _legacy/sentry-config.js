/**
 * Sentry Configuration Template
 * 
 * Instructions:
 * 1. Sign up at sentry.io
 * 2. Create a new JavaScript project
 * 3. Copy your DSN from the setup page
 * 4. Replace 'YOUR_DSN_HERE' below with your actual DSN
 * 5. Add this script to <head> of all HTML pages BEFORE other scripts
 * 
 * HTML Integration Example:
 * <script src="https://cdn.ravenjs.com/latest/raven.min.js"></script>
 * <script src="sentry-config.js"></script>
 */

(function() {
  // Only run in production (optional)
  // const isProduction = window.location.hostname !== 'localhost';
  // if (!isProduction) return;

  // Initialize Sentry with your DSN
  if (typeof Raven !== 'undefined') {
    Raven.config('YOUR_DSN_HERE', {
      environment: window.location.hostname === 'localhost' ? 'development' : 'production',
      shouldSendCallback: function(data) {
        // Optionally filter what gets sent
        // Don't send errors in certain conditions
        return true;
      },
      whitelistUrls: [
        // Only report errors from your domain
        /https?:\/\/(www\.)?yourdomain\.com/
      ]
    }).install();

    // Set user context (optional, if you have user info)
    // Raven.setUserContext({
    //   email: 'user@example.com',
    //   username: 'username'
    // });

    // Set tags for better filtering
    Raven.setTagsContext({
      page_type: 'portfolio',
      version: '1.0'
    });
  }

  // Global error handler for uncaught errors
  window.addEventListener('error', function(event) {
    if (typeof Raven !== 'undefined') {
      Raven.captureException(event.error);
    }
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    if (typeof Raven !== 'undefined') {
      Raven.captureException(event.reason);
    }
  });
})();
