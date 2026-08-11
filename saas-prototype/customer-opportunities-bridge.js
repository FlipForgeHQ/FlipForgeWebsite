(() => {
  "use strict";

  const stagingAdapter = window.FlipForgeStagingReadAdapter;
  const customerAdapter = window.FlipForgeCustomerOpportunities;
  if (!stagingAdapter || !customerAdapter) return;

  // Preserve the staging diagnostic implementation unchanged while routing the
  // customer Opportunities/Card Intelligence surface through the dedicated
  // production-safe adapter. Dashboard is intentionally not proxied here.
  window.FlipForgeStagingReadAdapter = Object.freeze({
    isEligible() {
      return customerAdapter.isEligible()
        || (typeof stagingAdapter.isEligible === "function" && stagingAdapter.isEligible());
    },
    renderCustomer(main, id = "") {
      return customerAdapter.render(main, id);
    },
    render(main, id = "") {
      return stagingAdapter.render(main, id);
    },
    reset: typeof stagingAdapter.reset === "function" ? () => stagingAdapter.reset() : undefined
  });
})();
