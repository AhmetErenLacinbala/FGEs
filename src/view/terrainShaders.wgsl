// Terrain shaders for streaming terrain (position + normal + uv)
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
    @location(1) Normal: vec3<f32>,
};

@vertex
fn vs_main(
    @builtin(instance_index) ID: u32,
    @location(0) vertexPosition: vec3<f32>, 
    @location(1) vertexNormal: vec3<f32>,
    @location(2) vertexTextureCoord: vec2<f32>) -> Fragment {

    var output : Fragment;
    output.Position = transformUBO.projection * transformUBO.view * objects.model[ID]* vec4<f32>(vertexPosition, 1.0);
    output.TexCoord = vertexTextureCoord;
    
    // Transform normal to world space
    let worldNormal = (objects.model[ID] * vec4<f32>(vertexNormal, 0.0)).xyz;
    output.Normal = normalize(worldNormal);
    
    return output;
}

@fragment
fn fs_main(@location(0) TexCoord: vec2<f32>, @location(1) Normal: vec3<f32>) -> @location(0) vec4<f32>{
    // Simple lighting using normal
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let dotProduct = max(dot(Normal, lightDir), 0.1); // Minimum ambient lighting
    
    let textureColor = textureSample(myTexture, mySampler, TexCoord);
    return vec4<f32>(textureColor.rgb * dotProduct, textureColor.a);
}