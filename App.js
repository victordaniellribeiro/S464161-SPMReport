Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {
        //Write app code here

        //API Docs: https://help.rallydev.com/apps/2.1/doc/

		var context =  this.getContext();
        var project = context.getProject()['ObjectID'];
        this.projectId = project;


        console.log('project:', project);

		var filterPanel = Ext.create('Ext.panel.Panel', {
			layout: 'hbox',
			align: 'stretch',
			padding: 5,
			itemId: 'filterPanel',
		});


		var mainPanel = Ext.create('Ext.panel.Panel', {
			title: 'SPM Report',
			layout: {
				type: 'vbox',
				align: 'stretch',
				padding: 5
			},
			//height: 800,
			padding: 5,
			itemId: 'mainPanel',
		});

		this.myMask = new Ext.LoadMask({
			msg: 'Please wait...',
			target: mainPanel
		});

		var releaseComboBox = Ext.create('Rally.ui.combobox.ReleaseComboBox', {
			fieldLabel: 'Choose Release',
			width: 450,
			itemId: 'releasaeComboBox',
			allowClear: true,
			scope: this,
			listeners: {
				ready: function(combobox) {
					// console.log('ready: ', combobox.getRecord());
					var records = [combobox.getRecord()];
					this._initReport(records);
				},
				select: function(combobox, records) {
					// console.log('comobo :', records);
					this._initReport(records);
				},
				scope: this
			}
		});

		filterPanel.add(releaseComboBox);

		this.add(filterPanel);

		this.add(mainPanel);
    },

    _initReport: function(records) {

    	var releaseId = records[0].get('ObjectID');
    	var releaseName = records[0].get('Name');
    	console.log('releaseId:', releaseId, releaseName);

    	this._getInitiatives(releaseName);

    },

    _getInitiatives: function(releaseName) {
    	this.myMask.show();
    	var featureStore = Ext.create('Rally.data.wsapi.artifact.Store', {
			context: {
		        projectScopeUp: false,
		        projectScopeDown: true,
		        project: '/project/'+ this.projectId //null to search all workspace
		    },
			models: ['PortfolioItem/Feature'],
			fetch: ['FormattedID', 'Name', 'Parent', 'ObjectID', 'Project', 'State', 'Type', 'Children', 'LeafStoryPlanEstimateTotal'],
			filters: [{
				property: 'Release.Name',
				operator: '=',
				value: releaseName
			}],
			limit: Infinity
		});


		featureStore.load().then({
			success: function(records) {
				//console.log('records', records);

				var map = new Ext.util.MixedCollection();
				var mapInitiativePerName = new Ext.util.MixedCollection();
				var totalLeafStoryPoints = 0;

				_.each(records, function(feature) {
					// console.log(feature.get('Project'))

					if (feature.get('Parent')) {
						var initiativeName = feature.get('Parent').Name;

						var parentName = feature.get('Parent').Name;
						var parentId = feature.get('Parent').FormattedID;

						parentName = parentId + ' - ' + initiativeName;

						totalLeafStoryPoints += feature.get('LeafStoryPlanEstimateTotal');

						if (!map.containsKey(parentName)) {
							var leafStoryPlanEstimateTotal = feature.get('LeafStoryPlanEstimateTotal');
							map.add(parentName, leafStoryPlanEstimateTotal);
						} else {
							var leafTotal = map.get(parentName);
							leafTotal += feature.get('LeafStoryPlanEstimateTotal');
							map.replace(parentName, leafTotal);
						}


						if (!mapInitiativePerName.containsKey(initiativeName)) {
							mapInitiativePerName.add(initiativeName, feature.get('Parent'));
						}
					}
				});


				console.log('map', map);
				console.log('total', totalLeafStoryPoints);


				var data = [];

				map.eachKey(function(initiativeName, leafStoryPlanEstimate) {
					var initiative = initiativeName.substring(initiativeName.indexOf(' - ')+3);
        			data.push({
						name: initiativeName,
						leafStoryPlanEstimate: leafStoryPlanEstimate,
						project: mapInitiativePerName.get(initiative).Project.Name,
						percPlanned: (leafStoryPlanEstimate / totalLeafStoryPoints * 100).toFixed(2) + '%'
					});
        		});

				console.log('data', data);
				console.log('initiatives', mapInitiativePerName);

				this._createReportPanel(data);
			},
			scope: this
		});
    },

    _createReportPanel: function(rows) {
		var featureStore = Ext.create('Ext.data.JsonStore', {
			fields: ['name', 'leafStoryPlanEstimate', 'project', 'percPlanned']
		});

		featureStore.loadData(rows);

		var featuresGrid = Ext.create('Ext.grid.Panel', {
			title: 'Initiative Capacity',
			height: 768,
			width: 650,
			viewConfig: {
				stripeRows: true,
				enableTextSelection: true
			},
			store: featureStore,
			columns: [{
				text: 'Initiative',
				flex: 2,
				sortable: true,
				dataIndex: 'name'
			}, {
				text: 'LeafStoryPlanEstimate For Release',
				flex: 1,
				sortable: true,
				dataIndex: 'leafStoryPlanEstimate'
			}, {
				text: 'Project',
				flex: 1,
				sortable: true,
				dataIndex: 'project'
			}, {
				text: 'Capacity',
				width: 120,
				sortable: true,
				dataIndex: 'percPlanned'
			}]
		});

		this.down('#mainPanel').removeAll(true);
		this.down('#mainPanel').add(featuresGrid);

		this.myMask.hide();
	}
});
