struct Transformdata{
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>
}
@binding(0) @group(0) var<uniform> tranformUBO: Transformdata

struct Fragment{
    @builtin(position) Position: vec4<f32>,
    @location(0) Color: vec4<f32>,
}

@vertex
fn vs_main(@location(0) vertexPosition: vec2<f32>, @location(1) vertexColor: vec3<f32>) -> Fragment{

    var output : Fragment;
    output.Position = tranformUBO.model * tranformUBO.view * tranformUBO.projection* vec4<f32>(vertexPosition, 1.0);
    output.Color = vec4<f32>(vertexColor,1.);
    return output;
}

@fragment
fn fs_main(@location(0) Color: vec4<f32>) -> @location(0) vec4<f32>{
    return Color;
}