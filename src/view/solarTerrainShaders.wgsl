// Solar Terrain Shaders - Renders 3D terrain with solar radiation overlay

struct TransformData {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

struct ObjectData {
    model: array<mat4x4<f32>>
}

@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var<storage,read> objects: ObjectData;

@binding(0) @group(1) var heightTexture: texture_2d<f32>;
@binding(1) @group(1) var solarTexture: texture_2d<f32>;
@binding(2) @group(1) var textureSampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) solarValue: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) solarValue: f32,
}

@vertex
fn vs_main(
    @builtin(instance_index) instanceId: u32,
    input: VertexInput
) -> VertexOutput {
    var output: VertexOutput;
    
    // Transform position to world space
    let worldPos = objects.model[instanceId] * vec4<f32>(input.position, 1.0);
    output.worldPosition = worldPos.xyz;
    
    // Transform to clip space
    output.position = transformUBO.projection * transformUBO.view * worldPos;
    
    // Transform normal to world space
    let worldNormal = (objects.model[instanceId] * vec4<f32>(input.normal, 0.0)).xyz;
    output.normal = normalize(worldNormal);
    
    // Pass through UV and solar value
    output.uv = input.uv;
    output.solarValue = input.solarValue;
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Sample height texture for terrain coloring
    let heightSample = textureSample(heightTexture, textureSampler, input.uv).r;
    
    // Sample solar texture for solar radiation data
    let solarSample = textureSample(solarTexture, textureSampler, input.uv).r;
    
    // Create base terrain color based on elevation
    let terrainColor = mix(
        vec3<f32>(0.2, 0.4, 0.1), // Low elevation (green)
        vec3<f32>(0.6, 0.5, 0.3), // High elevation (brown)
        heightSample * 0.01 // Normalize height
    );
    
    // Create solar radiation color overlay
    let solarColor = mix(
        vec3<f32>(0.0, 0.0, 0.5), // Low solar (dark blue)
        vec3<f32>(1.0, 1.0, 0.0), // High solar (bright yellow)
        input.solarValue // Already normalized 0-1
    );
    
    // Blend terrain and solar colors
    let finalColor = mix(terrainColor, solarColor, 0.6); // 60% solar overlay
    
    // Simple lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let lightIntensity = max(dot(input.normal, lightDir), 0.3);
    
    return vec4<f32>(finalColor * lightIntensity, 1.0);
}

// Alternative fragment shader for pure solar visualization
@fragment
fn fs_solar_only(input: VertexOutput) -> @location(0) vec4<f32> {
    // Pure solar radiation visualization
    let solarColor = mix(
        vec3<f32>(0.1, 0.0, 0.5), // Low solar (dark purple)
        vec3<f32>(1.0, 0.8, 0.0), // High solar (bright orange)
        input.solarValue
    );
    
    // Add some lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let lightIntensity = max(dot(input.normal, lightDir), 0.4);
    
    return vec4<f32>(solarColor * lightIntensity, 1.0);
}

// Alternative fragment shader for pure terrain visualization
@fragment
fn fs_terrain_only(input: VertexOutput) -> @location(0) vec4<f32> {
    // Pure terrain visualization
    let heightSample = textureSample(heightTexture, textureSampler, input.uv).r;
    
    let terrainColor = mix(
        vec3<f32>(0.2, 0.5, 0.1), // Low elevation (green)
        vec3<f32>(0.8, 0.6, 0.4), // High elevation (tan)
        heightSample * 0.005
    );
    
    // Add lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let lightIntensity = max(dot(input.normal, lightDir), 0.3);
    
    return vec4<f32>(terrainColor * lightIntensity, 1.0);
}
