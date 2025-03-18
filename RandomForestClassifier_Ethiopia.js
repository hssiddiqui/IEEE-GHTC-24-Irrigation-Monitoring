// var geometry = ee.Geometry.Polygon([
//   [[38.90, 8.72], [39.88,8.72], [39.88,8.20], [38.90,8.20]]
// ]);

var geometry = ee.FeatureCollection("FAO/GAUL/2015/level0")
              .filter(ee.Filter.eq('ADM0_NAME','Ethiopia'))
// var geometry = ee.FeatureCollection("FAO/GAUL/2015/level1")
//               .filter(ee.Filter.eq('ADM0_NAME','Ethiopia'))
//               .filter(ee.Filter.eq('ADM1_NAME','Oromia'));
// print(geometry)


//************************************************************************** 
// Composites
//************************************************************************** 

var imageCollection = ee.ImageCollection('COPERNICUS/S2_SR').filterBounds(geometry);

//Sentinel Cloud Masking Function
function maskCloudAndShadowsSR(image) {
  var cloudProb = image.select('MSK_CLDPRB');
  var snowProb = image.select('MSK_SNWPRB');
  var cloud = cloudProb.lt(5);
  var snow = snowProb.lt(5);
  var scl = image.select('SCL'); 
  var shadow = scl.eq(3); // 3 = cloud shadow
  var cirrus = scl.eq(10); // 10 = cirrus
  // Cloud probability less than 5% or cloud shadow classification
  var mask = (cloud.and(snow)).and(cirrus.neq(1)).and(shadow.neq(1));
  return image.updateMask(mask)
      .select("B.*")
      .copyProperties(image, ["system:time_start"]);
}

// create list of size n for number of desired months
var monthCount = ee.List.sequence(0, 11);
// run through the image collection and generate monthly median images
var composites = ee.ImageCollection.fromImages(monthCount.map(function(m) {
  //set start date
  var startMonth = 1; 
  var startYear = ee.Number(2021); 
  var startDate = ee.Date.fromYMD(startYear, startMonth, 1).advance(m,'month');
  //set end date to one month after start date
  var endDate = startDate.advance(1, 'month');
  //filter collection to images between start and end date
  var filtered = imageCollection.filterDate(startDate, endDate);
  
  // mask for clouds and then take the monthly median composite
  var composite = filtered.map(maskCloudAndShadowsSR).median();
  return composite
      .set('month', startDate)
      .set('system:time_start', startDate.millis());
}));

var vis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 3500};

// Replace masked pixels by the mean of the previous and next months 
var replacedVals = composites.map(function(image){
  var currentDate = ee.Date(image.get('system:time_start'));
  // create mean image which is derived from the two months before and after the current month
  var meanImage = composites.filterDate(
                currentDate.advance(-2, 'month'), currentDate.advance(2, 'month')).mean();
  // replace all masked values:
  return meanImage.where(image, image);
});


//Add EVI band to each image in the collection
var addEVI = function(image){
  var evi = image.expression('2.5 * ((NIR - RED) / (1 + NIR + 6 * RED - 7.5 * BLUE))',
    {'NIR': image.select('B8').divide(10000),
     'RED': image.select('B4').divide(10000),
     'BLUE': image.select('B2').divide(10000)});
     return image.addBands(evi);
};

//rename EVI band
var s2EVI = replacedVals.map(addEVI);
var s2EVI = s2EVI.select(['constant'],['EVI']);

// //Multiply by 10000 to rescale EVI
// var multiply10000 = function(image) {
//   return image.multiply(10000);
// };

// s2EVI = s2EVI.map(multiply10000);

// Map.addLayer(s2EVI.first(), {}, "EVI");

//Unstack the collection into a single image with one band for each month
var composite = s2EVI.select('EVI').toBands();
print(composite)
Map.addLayer(composite.clip(geometry), {}, "EVI", false);

//************************************************************************** 
// Masks
//************************************************************************** 
// Calculate the 10th and 90th percentile images
var percentile10 = composite.reduce(ee.Reducer.percentile([10]));
var percentile90 = composite.reduce(ee.Reducer.percentile([90]));

// Create masks for values below and above the thresholds
var mask1 = percentile10.lt(0.2); //Remove Evergreen pixels
var mask2 = percentile90.gt(0.2); //Remove Barren pixels
var ratio = percentile90.divide(percentile10);
var mask3 = ratio.gt(2); // Create a mask for areas where the ratio is greater than 2

// Apply the masks to the percentile images
var maskedComposite = composite.updateMask(mask1);
var maskedComposite = maskedComposite.updateMask(mask2);
var maskedComposite = maskedComposite.updateMask(mask3);

// Load the SRTM dataset
var srtm = ee.Image('USGS/SRTMGL1_003');
// Calculate the slope in degrees
var slope = ee.Terrain.slope(srtm);

// Create a mask for areas where the slope is less than 8%
var mask = slope.lt(8);

// Apply the mask to the slope image
var maskedComposite = maskedComposite.updateMask(mask);

var maskedComposite = maskedComposite.unmask(ee.Image.constant(0))
// Display the masked image
Map.addLayer(maskedComposite.clip(geometry), {}, "Masked EVI",false);

 
var gcps =
  irrig.map(function (feature) {
    return feature.set('class', 1);
  })
  .merge(
    nonirrig.map(function (feature) {
      return feature.set('class', 0);
    })
  );

// Add a random column and split the GCPs into training and validation set
var gcp = gcps.randomColumn()

// This being a simpler classification, we take 60% points
// for validation. Normal recommended ratio is
// 70% training, 30% validation
var trainingGcp = gcp.filter(ee.Filter.lt('random', 0.7));
var validationGcp = gcp.filter(ee.Filter.gte('random', 0.7));

// Overlay the point on the image to get training data.
var training = composite.sampleRegions({
  collection: trainingGcp,
  properties: ['class'],
  scale: 30,
  tileScale: 16
});

//************************************************************************** 
// Classifier Training
//************************************************************************** 

var classifier = ee.Classifier.smileRandomForest(50)
.train({
  features: training,  
  classProperty: 'class',
  inputProperties: composite.bandNames()
});

Export.classifier.toAsset(
  classifier
);

// Classify the image.
var classified = maskedComposite.classify(classifier);
Map.addLayer(classified.clip(geometry), {min: 0, max: 1, palette: ['black','green']}, 'Irrigation Classification',false);

//************************************************************************** 
// Accuracy Assessment
//************************************************************************** 

var validation = composite.sampleRegions({
  collection: validationGcp,
  properties: ['class'],
  scale: 30,
  tileScale: 16
});

var test = validation.classify(classifier);

var testConfusionMatrix = test.errorMatrix('class', 'classification')
// Printing of confusion matrix may time out. Alternatively, you can export it as CSV
print('Confusion Matrix', testConfusionMatrix);
print('Test Accuracy', testConfusionMatrix.accuracy());
print('F1', testConfusionMatrix.fscore());





Map.centerObject(geometry);
// Map.addLayer(geometry, {}, 'Geometry');
Map.addLayer(irrig, {color: 'Blue'}, 'Irrig');
Map.addLayer(nonirrig, {color: 'Red'}, 'Non-Irrig');


// //************************************************************************** 
// // Hyperparameter tuning. 
// //************************************************************************** 
// var numTrees = ee.List.sequence(5, 60, 5); 
// var accuracies = numTrees.map(function(t) { 
//   var classifier = ee.Classifier.smileRandomForest(t) 
//   .train({ 
//     features: training, 
//     classProperty: 'class', 
//     inputProperties: composite.bandNames() 
//   });
//   return validation 
//   .classify(classifier) 
//   .errorMatrix('class', 'classification') 
//   .accuracy(); 
  
// }); 

// print(ui.Chart.array.values({ 
//   array: ee.Array(accuracies), 
//   axis: 0, 
//   xLabels: numTrees 
// }).setOptions({ 
//     hAxis: { title: 'Number of trees' }, 
//     vAxis: { title: 'Accuracy' }, 
//     title: 'Accuracy vs number of Random Forest trees' 
// }));
