$(document).ready(function(){
     $("button").click(async function(){
          var fname = $("input[name='fullname']").val();
          var email = $("input[name='email']").val();

          $.ajax({
               type: "POST",
               dataType: "json",
               url: "http://159.65.33.194/register",
               data: {
                    fullname: fname,
                    email: email
               }, 
               success: function(data){
                    
               }
          });
     });
});
