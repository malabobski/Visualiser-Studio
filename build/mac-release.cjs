const config=require('../package.json').build;
module.exports={...config,extraMetadata:{visualiserManualMacUpdates:true},directories:{output:'dist/mac-release'},mac:{...config.mac,identity:'-',hardenedRuntime:false,notarize:false},publish:null};
