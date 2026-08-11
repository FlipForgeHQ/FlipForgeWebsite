(() => {
  "use strict";

  const previewAdapter = window.FlipForgeCustomerEntitlements;
  const productionAdapter = window.FlipForgeProductionAccount;
  if (!previewAdapter || !productionAdapter) return;

  window.FlipForgeCustomerEntitlements = Object.freeze({
    isEligible() {
      return productionAdapter.isEligible()
        || (typeof previewAdapter.isEligible === "function" && previewAdapter.isEligible());
    },
    render(main) {
      if (productionAdapter.isEligible()) return productionAdapter.render(main);
      return previewAdapter.render(main);
    }
  });
})();
