// Terrain Shader with Dual Texture Blending
// Blends GHI heatmap with satellite imagery

struct TransformData {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct ObjectData {
    model: array<mat4x4<f32>>
};

struct BlendSettings {
    satelliteOpacity: f32,  // 0.0 = GHI only, 1.0 = satellite only
    _padding1: f32,
    _padding2: f32,
    _padding3: f32,
};

// Group 0: Frame data (shared)
@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var<storage, read> objects: ObjectData;

// Group 1: Terrain material (dual textures + blend)
@binding(0) @group(1) var ghiTexture: texture_2d<f32>;
@binding(1) @group(1) var ghiSampler: sampler;
@binding(2) @group(1) var satelliteTexture: texture_2d<f32>;
@binding(3) @group(1) var satelliteSampler: sampler;
@binding(4) @group(1) var<uniform> blendSettings: BlendSettings;

struct Fragment {
    @builtin(position) Position: vec4<f32>,
    @location(0) TexCoord: vec2<f32>,
};

@vertex
fn vs_main(
    @builtin(instance_index) ID: u32,
    @location(0) vertexPosition: vec3<f32>,
    @location(1) vertexTexCoord: vec2<f32>
) -> Fragment {
    var output: Fragment;
    output.Position = transformUBO.projection * transformUBO.view * objects.model[ID] * vec4<f32>(vertexPosition, 1.0);
    output.TexCoord = vertexTexCoord;
    return output;
}

@fragment
fn fs_main(@location(0) TexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    // Sample both textures
    let ghiColor = textureSample(ghiTexture, ghiSampler, TexCoord);
    let satelliteColor = textureSample(satelliteTexture, satelliteSampler, TexCoord);
    
    // Blend: GHI * (1 - opacity) + Satellite * opacity
    let blendedColor = mix(ghiColor, satelliteColor, blendSettings.satelliteOpacity);
    
    return blendedColor;
}

