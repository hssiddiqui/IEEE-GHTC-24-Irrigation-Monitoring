// var geometry = ee.Geometry.Polygon([
//   [[38.90, 8.72], [39.88,8.72], [39.88,8.20], [38.90,8.20]]
// ]);

var geometry = ee.FeatureCollection("FAO/GAUL/2015/level0")
              .filter(ee.Filter.eq('ADM0_NAME','Ethiopia'))
// var geometry = ee.FeatureCollection("FAO/GAUL/2015/level1")
//               .filter(ee.Filter.eq('ADM0_NAME','Ethiopia'))
//               .filter(ee.Filter.eq('ADM1_NAME','Oromia'));
// print(geometry)




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

 




// Load classifier and classify image
var classifierAssetId = "users/HSSiddiqui/Ethiopia/RF_Ethiopiairrig-2021";
var savedClassifier = ee.Classifier.load(classifierAssetId);
var classified=maskedComposite.classify(savedClassifier).clip(geometry)
Map.addLayer(classified, {min: 0, max: 1, palette: ['black','green']}, 'Irrigation Classification');






Map.centerObject(geometry);
Map.addLayer(geometry, {}, 'Geometry',false);
Map.addLayer(irrig, {color: 'Blue'}, 'Irrig');
Map.addLayer(nonirrig, {color: 'Red'}, 'Non-Irrig');

// //************************************************************************** 
// // Phenology Map
// //************************************************************************** 
// var roi = ee.FeatureCollection("FAO/GAUL/2015/level0") 
//               .filter(ee.Filter.eq('ADM0_NAME','Ethiopia'));
// Map.centerObject(roi);
// // select 3 years of MODIS imagery
// var collection = ee.ImageCollection("MODIS/061/MOD13Q1");
// collection = collection.filterBounds(roi)
//                 .filterDate('2020-01-01', '2022-12-31');
 
// collection = collection.select('EVI');

// //scale the values from -2000 to 10000 to 0 to 255
// var scale = function(image){
//   image = image.divide(10000);
//   image = image.unitScale(-0.2, 1.0);
//   return image.multiply(255);
// };

// collection = collection.map(scale);
// print(collection)


// // define the temporal endmembers for 3 years (69 images)
// var Red = [ 79.450808, 76.769147, 76.072258,
//   74.246695  ,   73.872365 , 74.397552 ,
// 73.692078  ,  74.043053,  76.683354, 
// 77.963030 ,  84.505257, 96.233802 ,
// 121.091483  , 131.860102  , 154.924272,
// 152.873212 , 146.212940,139.595443 ,
// 127.868793  , 106.269450 ,  95.570976 ,
// 89.169375 , 84.204167,  82.254387,
//   79.799529,  77.642986  , 75.245818,
// 74.802960 ,  73.892213,  74.753995,
// 75.686348,  76.765991,  77.047354  ,
//   81.580881  , 91.975474 , 107.145965 ,
// 130.741484,  156.149465,  154.123407,
// 150.205313, 134.466384, 109.777964 ,
//   99.379601,  90.078800,   82.209050  ,
//   79.339370 ,   77.721608 ,  75.759043 ,
//   74.379455 ,  73.505427,  72.183796,
// 71.585481,  74.666729 ,  74.300777,
//   74.552636 , 75.822115, 85.874337,
//   95.875234 ,124.590441, 143.520906  ,
// 144.722757, 153.013100,  150.072040,
// 142.913496 ,  113.714842,  104.620766  ,
//   94.445178 ,  86.436830, 81.852179 ];
   
// var Green = [117.092322,115.295148,111.825958,
// 114.257123,116.152624,141.300745,
// 143.458177,144.877416,143.015953,
// 136.828993,125.147611,114.074844,
// 103.926822,109.384972,118.268825,
// 114.386244,107.043879,115.681227,
// 125.753668,128.674466,128.790201,
// 129.201104,123.562484,121.832772,
// 114.894691,115.586803,109.161997,
// 120.040387,123.525787,134.607684,
// 139.540638,143.146807,135.376606,
// 129.549256,121.579922,111.22259,
// 111.77129,124.581656,106.791183,
// 117.384464,126.821041,129.542932,
// 127.399548,128.325634,124.976864,
// 122.158751,117.963145,116.390998,
// 112.456127,112.425531,97.51144,
// 118.376032,131.629971,132.052855,
// 130.242721,125.603344,128.490837,
// 108.22145,106.187899,99.606944,
// 98.150124,102.481078,117.432465,
// 108.809724,109.240206,129.410939,
// 131.826709,125.127417,131.559604,];

// var Blue = [86.450941,
// 82.316331,
// 78.619735,
// 79.002652,
// 83.152906,
// 93.350057,
// 106.173828,
// 119.643343,
// 133.067496,
// 140.498189,
// 144.937123,
// 138.773003,
// 126.196561,
// 133.030223,
// 129.187518,
// 120.61326,
// 130.519771,
// 141.532889,
// 142.234386,
// 126.40151,
// 110.961893,
// 99.333018,
// 88.60554,
// 86.917918,
// 81.85427,
// 79.617304,
// 78.251658,
// 82.792607,
// 88.702203,
// 93.230132,
// 107.320878,
// 126.057044,
// 134.63001,
// 140.399994,
// 139.074432,
// 126.748474,
// 119.802224,
// 127.248665,
// 127.948295,
// 134.940183,
// 148.087959,
// 142.426415,
// 131.733722,
// 113.477734,
// 98.779724,
// 91.266111,
// 85.536693,
// 81.320232,
// 78.11057,
// 78.240384,
// 78.675999,
// 85.13947,
// 95.028481,
// 118.476982,
// 132.205072,
// 139.380292,
// 139.603642,
// 140.060022,
// 119.883286,
// 129.796757,
// 118.351012,
// 115.4835,
// 134.336454,
// 133.267692,
// 141.29006,
// 131.019725,
// 111.456457,
// 96.400977,
// 89.874008];

// var Dark = [74.652037,
// 73.731419,
// 73.056651,
// 72.879585,
// 73.096645,
// 74.608075,
// 75.065593,
// 74.975822,
// 76.107322,
// 75.192625,
// 75.705064,
// 76.529653,
// 82.41754,
// 89.35142,
// 96.733686,
// 93.613065,
// 91.048966,
// 89.766675,
// 88.697085,
// 84.109048,
// 80.932002,
// 79.083937,
// 77.370352,
// 76.872153,
// 75.555249,
// 74.923453,
// 73.470811,
// 74.158116,
// 73.882815,
// 74.948356,
// 75.341198,
// 76.369014,
// 76.033075,
// 75.444546,
// 76.364005,
// 80.821396,
// 90.372302,
// 96.316949,
// 96.127542,
// 94.616382,
// 91.093208,
// 86.320296,
// 83.105334,
// 80.226565,
// 77.541235,
// 76.179222,
// 75.104871,
// 73.732216,
// 73.254744,
// 72.896218,
// 71.450516,
// 72.621044,
// 73.888176,
// 74.943081,
// 74.758702,
// 74.747334,
// 74.913866,
// 77.283665,
// 81.42805,
// 88.685944,
// 94.202925,
// 96.364136,
// 92.413516,
// 90.516837,
// 85.31645,
// 83.443266,
// 80.844356,
// 78.570571,
// 76.90629];
          
// //collapse the stack into a multi-band raster          
// var modisEVI = collection.toBands();
// //unmix the image using the unit sum constraint
// var tEMs = modisEVI.unmix({endmembers: [Red, Green, Blue, Dark],
//                         sumToOne: true,
//                         nonNegative: false
// });

// tEMs = tEMs.rename(['Red', 'Green', 'Blue', 'Dark']);


// tEMs=tEMs.clip(roi);
// var maskB = tEMs.select('Blue').lt(0.35);
// var maskedClassified = classified.updateMask(maskB);
// var maskedClassified = maskedClassified.unmask(ee.Image.constant(0))
// Map.addLayer(maskedClassified.clip(geometry), {min: 0, max: 1, palette: ['black','green']}, "Masked preds");
