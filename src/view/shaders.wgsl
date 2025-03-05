struct TransformData{
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct ObjectData{
    model: array<mat4x4<f32>>
}

@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var<storage,read> objects: ObjectData;

@binding(0) @group(1) var myTexture: texture_2d<f32>;
@binding(1) @group(1) var mySampler: sampler;

struct Fragment{
    @builtin(position) Position: vec4<f32>,
    @location(0) TexCoord: vec2<f32>,
};

@vertex
fn vs_main(
    @builtin(instance_index) ID: u32,
    @location(0) vertexPosition: vec3<f32>, 
    @location(1) vertexTextureCoord: vec2<f32>) -> Fragment {

    var output : Fragment;
    output.Position = transformUBO.projection * transformUBO.view * objects.model[ID]* vec4<f32>(vertexPosition, 1.0);
    output.TexCoord = vertexTextureCoord;
    return output;
}

@fragment
fn fs_main(@location(0) TexCoord: vec2<f32>) -> @location(0) vec4<f32>{
    return textureSample(myTexture, mySampler, TexCoord);
}


