/*global QUnit*/
sap.ui.define([
	"sap/ui/test/opaQunit",
	"sap/ui/test/Opa5",
	"./pages/AppPage",
	"./pages/View1Page"
], function (opaTest, Opa5, AppPage, View1Page) {
	"use strict";

	QUnit.module("Navigation Journey");

	const onTheAppPage = new AppPage();
	const onTheViewPage = new View1Page();

	Opa5.extendConfig({
		viewNamespace: "prpayment.projectprpayment.view.",
		autoWait: true
	});

	opaTest("Should see the initial page of the app", function () {
		// Arrangements
		onTheAppPage.iStartMyUIComponent({
			componentConfig: {
				name: "prpayment.projectprpayment"
			}
		});

		// Assertions
		onTheAppPage.iShouldSeeTheApp();
		onTheViewPage.iShouldSeeThePageView();

		// Cleanup
		onTheAppPage.iTeardownMyApp();
	});
});
