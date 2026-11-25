sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";

	const sViewName = "App";

	return Opa5.extend("prpayment.projectprpayment.test.integration.pages.AppPage", {
		// Assertions
		iShouldSeeTheApp: function () {
			return this.waitFor({
				id: "app",
				viewName: sViewName,
				success: function () {
					Opa5.assert.ok(true, "The " + sViewName + " view is displayed");
				},
				errorMessage: "Did not find the " + sViewName + " view"
			});
		}
	});
});
