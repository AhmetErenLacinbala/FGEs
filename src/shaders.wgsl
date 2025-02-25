struct Fragment{
    @builtin(position) Position: vec4<f32>,
    @location(0) Color: vec4<f32>,
}

@stage(vertex)
fn vs_main(@builtin(vertex_index) i_id: u32) -> Fragment{

   var position = array<vec2<f32>, 3>(
         vec2<f32>(0.0, 0.5),
         vec2<f32>(-0.5, -0.5),
         vec2<f32>(0.5, -0.5) 
   );
    var color = array<vec4<f32>, 3>(
        vec4<f32>(1.0, 0.0, 0.0, 1.0),
        vec4<f32>(0.0, 1.0, 0.0, 1.0),
        vec4<f32>(0.0, 0.0, 1.0, 1.0)
    );

    var output : Fragment;
    output.Position = vec4<f32>(position[i_id], 0.0, 1.0);
    output.Color = vec4<f32>(color[i_id],1.);
    return output;
}

@stage(fragment)
fn fs_main(@location(0) Color: vec4<f32>) -> @location(0) vec4<f32>{
    return Color;
}