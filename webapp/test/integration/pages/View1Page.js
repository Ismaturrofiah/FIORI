sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";

	const sViewName = "View1";

	return Opa5.extend("prpayment.projectprpayment.test.integration.pages.View1Page", {
		// Assertions
		iShouldSeeThePageView: function () {
			return this.waitFor({
				id: "page",
				viewName: sViewName,
				success: function () {
					Opa5.assert.ok(true, "The " + sViewName + " view is displayed");
				},
				errorMessage: "Did not find the " + sViewName + " view"
			});
		}
	});
});
