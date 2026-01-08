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

struct SelectionQuad {
    p0: vec2<f32>,
    p1: vec2<f32>,
    p2: vec2<f32>,
    p3: vec2<f32>,
    enabled: f32,
    time: f32,
    _pad2: f32,
    _pad3: f32
}

// Group 0: Frame data (shared)
@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var<storage, read> objects: ObjectData;

// Group 1: Terrain material (dual textures + blend)
@binding(0) @group(1) var ghiTexture: texture_2d<f32>;
@binding(1) @group(1) var ghiSampler: sampler;
@binding(2) @group(1) var satelliteTexture: texture_2d<f32>;
@binding(3) @group(1) var satelliteSampler: sampler;
@binding(4) @group(1) var<uniform> blendSettings: BlendSettings;
@binding(5) @group(1) var<uniform> selectionQuad: SelectionQuad;

struct Fragment {
    @builtin(position) Position: vec4<f32>,
    @location(0) TexCoord: vec2<f32>,
    @location(1) WorldPos: vec3<f32>,
    @location(2) WorldNormal: vec3<f32>,
};

@vertex
fn vs_main(
    @builtin(instance_index) ID: u32,
    @location(0) vertexPosition: vec3<f32>,
    @location(1) vertexNormal: vec3<f32>,
    @location(2) vertexTexCoord: vec2<f32>
) -> Fragment {
    var output: Fragment;
    let model = objects.model[ID];
    let worldPos = model * vec4<f32>(vertexPosition, 1.0);
    
    // Transform normal to world space (using upper 3x3 of model matrix)
    let worldNormal = normalize((model * vec4<f32>(vertexNormal, 0.0)).xyz);
    
    output.Position = transformUBO.projection * transformUBO.view * worldPos;
    output.TexCoord = vertexTexCoord;
    output.WorldPos = worldPos.xyz;
    output.WorldNormal = worldNormal;
    return output;
}


fn sign2D(p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>) -> f32 {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

fn pointInTriangle(pt: vec2<f32>, v1: vec2<f32>, v2: vec2<f32>, v3: vec2<f32>) -> bool {
    let d1 = sign2D(pt, v1, v2);
    let d2 = sign2D(pt, v2, v3);
    let d3 = sign2D(pt, v3, v1);
    
    let hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
    let hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
    
    return !(hasNeg && hasPos);
}

fn isInsideSelectionQuad(pt: vec2<f32>) -> bool {
    if (selectionQuad.enabled < 0.5) {
        return false;
    }
    
    let inTri1 = pointInTriangle(pt, selectionQuad.p0, selectionQuad.p1, selectionQuad.p2);
    let inTri2 = pointInTriangle(pt, selectionQuad.p0, selectionQuad.p2, selectionQuad.p3);
    
    return inTri1 || inTri2;
}

// Calculate slope angle from normal (returns degrees)
fn getSlopeAngle(normal: vec3<f32>) -> f32 {

    let cosAngle = clamp(abs(normal.z), 0.0, 1.0);
    return acos(cosAngle) * (180.0 / 3.14159265);
}

@fragment
fn fs_main(
    @location(0) TexCoord: vec2<f32>, 
    @location(1) WorldPos: vec3<f32>,
    @location(2) WorldNormal: vec3<f32>
) -> @location(0) vec4<f32> {
    // Sample both textures
    let ghiColor = textureSample(ghiTexture, ghiSampler, TexCoord);
    let satelliteColor = textureSample(satelliteTexture, satelliteSampler, TexCoord);
    
    var finalColor = mix(ghiColor, satelliteColor, blendSettings.satelliteOpacity);

    // Selection highlight with slope coloring for solar panel suitability
    let pt = vec2<f32>(WorldPos.x, WorldPos.y);
    if (isInsideSelectionQuad(pt)) {
        let slopeAngle = getSlopeAngle(WorldNormal);
        let pulse = (sin(selectionQuad.time) + 1.0) * 0.2 + 0.4; // 0.4-0.6
        
        var slopeColor: vec4<f32>;
        
        if (slopeAngle <= 5.0) {
            // 0-5° → İDEAL (Koyu Yeşil)
            slopeColor = vec4<f32>(0.0, 0.8, 0.0, 1.0);
        } else if (slopeAngle <= 10.0) {
            // 5-10° → KABUL EDİLEBİLİR (Sarı-Yeşil)
            slopeColor = vec4<f32>(0.7, 0.9, 0.0, 1.0);
        } else if (slopeAngle <= 15.0) {
            // 10-15° → EKONOMİK RİSK (Turuncu)
            slopeColor = vec4<f32>(1.0, 0.6, 0.0, 1.0);
        } else {
            // 15°+ → UYGUN DEĞİL (Kırmızı)
            slopeColor = vec4<f32>(1.0, 0.15, 0.15, 1.0);
        }
        
        finalColor = mix(finalColor, slopeColor, pulse);
    }
    
    return finalColor;
}

