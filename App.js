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
				//align: 'stretch',
				padding: 5
			},
			width:'100%',
            autoScroll:true,
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
			multiSelect: true,
			showArrows: false,
			width: 450,
			itemId: 'releaseComboBox',
			allowClear: true,
			scope: this,
			listeners: {
				ready: function(combobox) {
					console.log('ready: ', combobox.valueModels[0]);
					var records = [combobox.valueModels[0]];
					this._initReport(records);
				},
				select: function(combobox, records) {
					console.log('comobo :', records);
					this._initReport(records);
				},
				scope: this
			}
		});

		filterPanel.add(releaseComboBox);

		this.add(filterPanel);

		this.add(mainPanel);
    },

    _initReport: function(releases) {
    	this.myMask.show();

    	if (releases) {

    		var promiseFeatures = [];

    		_.each(releases, function(release) {
    			console.log('getting report for release:', release);

    			var releaseId = release.get('ObjectID');
    			var releaseName = release.get('Name');

		    	console.log('releaseId:', releaseId, releaseName);

		    	promiseFeatures.push(this._getFeatures(releaseName));

		    }, this);

	    	Deft.Promise.all(promiseFeatures).then({
        		success: function(records) {
        			console.log('features loaded:', records);

        			//map with IXXX - Name / TotalLeafPoints
    				var map = new Ext.util.MixedCollection();
					var mapInitiativePerName = new Ext.util.MixedCollection();
					var totalLeafStoryPoints = 0;
					var initiativeIds = [];

        			_.each(records, function(features) {
						_.each(features, function(feature) {
							// console.log(feature.get('Project'))

							if (feature.get('Parent')) {
								var initiativeName = feature.get('Parent').Name;

								var parentName = feature.get('Parent').Name;
								var parentObjectId = feature.get('Parent').ObjectID;
								var parentId = feature.get('Parent').FormattedID;
								initiativeIds.push(parentObjectId);

								//Use id with name: IXXX - Name
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
        			}, this);


        			console.log('map', map);
					console.log('total', totalLeafStoryPoints);

					var promise = this._getInitiatives(initiativeIds);

					Deft.Promise.all([promise]).then({
	            		success: function(records) {
	            			//map Name/Initiative
	            			var initiativesMap = records[0];
	            			console.log('init map:', initiativesMap);

	            			var data = [];

							map.eachKey(function(initiativeName, leafStoryPlanEstimate) {
								var initiative = initiativeName.substring(initiativeName.indexOf(' - ')+3);
			        			data.push({
									name: initiativeName,
									leafStoryPlanEstimate: leafStoryPlanEstimate,
									c_StrategyCategory: initiativesMap.get(initiative).get('c_StrategyCategory'),
									project: mapInitiativePerName.get(initiative).Project.Name,
									percPlanned: (leafStoryPlanEstimate / totalLeafStoryPoints * 100).toFixed(2) + '%'
								});
			        		});

							// console.log('data', data);
							// console.log('initiatives', mapInitiativePerName);

							this._createReportPanel(data);
	            		},
			            failure: function(error) {
			                console.log('error:', error);
			            },
			            scope: this
			        });
        		},
	            failure: function(error) {
	                console.log('error:', error);
	            },
	            scope: this
	        });    		
    	}
    },

    _getFeatures: function(releaseName) {
    	var deferred = Ext.create('Deft.Deferred');

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
				deferred.resolve(records);				
			},
			scope: this
		});

		return deferred.promise;
    },


    _getInitiatives: function(initiativeIds) {
    	console.log('looking for initiatives:', initiativeIds);
    	var deferred = Ext.create('Deft.Deferred');

		Ext.create('Rally.data.wsapi.Store', {
            model: 'PortfolioItem/Initiative',
            autoLoad: true,
            limit: Infinity,
            fetch: ['FormattedID', 'Name', 'ObjectID', 'c_StrategyCategory'],
            context: {
                projectScopeUp: false,
                projectScopeDown: true,
                project: null //null to search all workspace
            },
            filters: [{
                property: 'ObjectID',
                operator: 'in',
                value: initiativeIds
            }],
            listeners: {
                load: function(store, data, success) {
                    // console.log('initiatives:', data);
                    var map = new Ext.util.MixedCollection();

                    _.each(data, function(record) {
                    	if (!map.containsKey(record.get('Name'))) {
                    		map.add(record.get('Name'), record);
                    	}
                    });

                    deferred.resolve(map);
                }
            }, scope: this
        });

        return deferred.promise;
    },


    _createReportPanel: function(rows) {
		var featureStore = Ext.create('Ext.data.JsonStore', {
			fields: ['name', 'c_StrategyCategory', 'leafStoryPlanEstimate', 'project', 'percPlanned']
		});

		featureStore.loadData(rows);

		var featuresGrid = Ext.create('Ext.grid.Panel', {
			title: 'Initiative Capacity',
			//height: 768,
			width: 1200,
			viewConfig: {
				stripeRows: true,
				enableTextSelection: true
			},
			store: featureStore,
			columns: [{
				text: 'Initiative',
				flex: 3,
				sortable: true,
				dataIndex: 'name'
			}, {
				text: 'Strategy Category',
				flex: 1,
				sortable: true,
				dataIndex: 'c_StrategyCategory'
			},{
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

		var exportButton = Ext.create('Rally.ui.Button', {
        	text: 'Export',
        	margin: '10 10 10 10',
        	scope: this,
        	handler: function() {
        		var csv = this._convertToCSV(rows);
        		console.log('converting to csv:', csv);


        		//Download the file as CSV
		        var downloadLink = document.createElement("a");
		        var blob = new Blob(["\ufeff", csv]);
		        var url = URL.createObjectURL(blob);
		        downloadLink.href = url;
		        downloadLink.download = "report.csv";  //Name the file here
		        document.body.appendChild(downloadLink);
		        downloadLink.click();
		        document.body.removeChild(downloadLink);
        	}
        });

		this.down('#mainPanel').removeAll(true);
		this.down('#mainPanel').add(exportButton);
		this.down('#mainPanel').add(featuresGrid);

		this.myMask.hide();
	},


	_convertToCSV: function(objArray) {
		var fields = Object.keys(objArray[0]);

		var replacer = function(key, value) { return value === null ? '' : value; };
		var csv = objArray.map(function(row){
		  return fields.map(function(fieldName) {
		    return JSON.stringify(row[fieldName], replacer);
		  }).join(',');
		});

		csv.unshift(fields.join(',')); // add header column

		//console.log(csv.join('\r\n'));

		return csv.join('\r\n');
    }
});
