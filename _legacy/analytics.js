/**
 * Analytics Module for Portfolio
 * Tracks user interactions and gallery navigation
 * Requires Google Analytics 4 gtag script in HTML head
 */

const Analytics = {
  /**
   * Track a custom event
   * @param {string} eventName - Event name (snake_case recommended)
   * @param {object} parameters - Event parameters
   */
  trackEvent(eventName, parameters = {}) {
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, parameters);
    }
  },

  /**
   * Track project view
   * @param {string} projectId - Project ID
   * @param {number} projectIndex - Index in filtered list
   * @param {string} filter - Active filter (all, design, photo)
   */
  trackProjectView(projectId, projectIndex, filter = 'all') {
    this.trackEvent('project_view', {
      project_id: projectId,
      project_index: projectIndex,
      filter: filter,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Track filter change
   * @param {string} filter - New filter value
   */
  trackFilterChange(filter) {
    this.trackEvent('filter_change', {
      filter: filter,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Track subcategory filter
   * @param {string} subfilter - Subcategory value
   * @param {string} parentFilter - Parent filter
   */
  trackSubfilterChange(subfilter, parentFilter) {
    this.trackEvent('subfilter_change', {
      subfilter: subfilter,
      parent_filter: parentFilter,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Track contact CTA click
   */
  trackContactClick() {
    this.trackEvent('contact_click', {
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Track navigation to contact page
   */
  trackContactPageView() {
    this.trackEvent('page_view', {
      page_title: 'Contact',
      page_location: window.location.href
    });
  },

  /**
   * Track error events for debugging
   * @param {string} message - Error message
   * @param {string} source - Source of error (JavaScript, Network, etc.)
   */
  trackError(message, source = 'unknown') {
    this.trackEvent('error_occurred', {
      error_message: message,
      error_source: source,
      page_url: window.location.href,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Set user properties (useful for filtering internal traffic)
   * @param {object} properties - User properties
   */
  setUserProperties(properties) {
    if (typeof gtag !== 'undefined') {
      gtag('set', { 'user_properties': properties });
    }
  },

  /**
   * Filter internal/test traffic by user ID or property
   * @param {boolean} isInternal - Whether this is internal traffic
   */
  markInternalTraffic(isInternal) {
    this.setUserProperties({ 'is_internal': isInternal });
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}
